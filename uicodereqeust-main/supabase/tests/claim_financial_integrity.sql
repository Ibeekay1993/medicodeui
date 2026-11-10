-- Read-only structural regression checks for migration
-- 20261110170000_harden_claim_and_payment_integrity.sql.
-- Run against a disposable/current schema after applying that migration:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/claim_financial_integrity.sql

DO $$
DECLARE
  v_claim_guard TEXT;
  v_claim_audit_rpc TEXT;
  v_payment_settle_rpc TEXT;
  v_payment_guard TEXT;
  v_contest_rpc TEXT;
  v_unlock_rpc TEXT;
  v_request_index TEXT;
  v_auth_code_index TEXT;
BEGIN
  IF has_table_privilege('authenticated', 'public.hospital_claims', 'INSERT') THEN
    RAISE EXCEPTION 'Authenticated clients must not insert claims directly';
  END IF;

  SELECT pg_get_functiondef('public.protect_hospital_claims_totals()'::regprocedure)
    INTO v_claim_guard;
  IF v_claim_guard ILIKE '%NEW.total_amount := 0%'
     OR v_claim_guard NOT ILIKE '%medcode.claim_financial_rpc%'
     OR v_claim_guard NOT ILIKE '%NEW.payment_status = ''paid''%'
     OR v_claim_guard NOT ILIKE '%medcode.payment_settlement_rpc%' THEN
    RAISE EXCEPTION 'Claim guard still zeroes inserts or lacks the controlled audit-RPC path';
  END IF;

  SELECT pg_get_functiondef('public.rpc_update_claim_status(uuid,text,jsonb)'::regprocedure)
    INTO v_claim_audit_rpc;
  IF v_claim_audit_rpc NOT ILIKE '%v_approved_amount > v_original_amount%'
     OR v_claim_audit_rpc NOT ILIKE '%v_items_total%'
     OR v_claim_audit_rpc NOT ILIKE '%v_auth.authorization_code%'
     OR v_claim_audit_rpc ILIKE '%total_amount = COALESCE%' THEN
    RAISE EXCEPTION 'Claim audit RPC does not enforce authorization and item-total ceilings';
  END IF;

  SELECT pg_get_functiondef('public.settle_payment_batch_transactional(uuid,jsonb)'::regprocedure)
    INTO v_payment_settle_rpc;
  IF v_payment_settle_rpc NOT ILIKE '%v_eligible_count <> v_linked_count%'
     OR v_payment_settle_rpc NOT ILIKE '%v_batch.total_amount%'
     OR v_payment_settle_rpc NOT ILIKE '%paid_by = v_user_id%'
     OR v_payment_settle_rpc NOT ILIKE '%<= ar.total_amount%'
     OR v_payment_settle_rpc NOT ILIKE '%ar.authorization_code%' THEN
    RAISE EXCEPTION 'Payment settlement does not recompute totals or bind the actor to auth.uid()';
  END IF;

  SELECT pg_get_functiondef('public.enforce_payment_batch_immutability()'::regprocedure)
    INTO v_payment_guard;
  IF v_payment_guard NOT ILIKE '%medcode.payment_settlement_rpc%'
     OR v_payment_guard NOT ILIKE '%NEW.paid_by IS DISTINCT FROM OLD.paid_by%'
     OR v_payment_guard NOT ILIKE '%NEW.receipt_url IS DISTINCT FROM OLD.receipt_url%' THEN
    RAISE EXCEPTION 'Payment batches can bypass the settlement RPC';
  END IF;

  SELECT pg_get_functiondef('public.rpc_submit_claim_contest(uuid,text,jsonb,numeric)'::regprocedure)
    INTO v_contest_rpc;
  IF v_contest_rpc NOT ILIKE '%public.has_role(v_uid%'
     OR v_contest_rpc NOT ILIKE '%v_claim.contest_deadline%'
     OR v_contest_rpc NOT ILIKE '%v_max_contestable%' THEN
    RAISE EXCEPTION 'Claim contests lack active-role, deadline, or amount-bound validation';
  END IF;

  SELECT pg_get_functiondef('public.rpc_unlock_hospital_claim(uuid)'::regprocedure)
    INTO v_unlock_rpc;
  IF v_unlock_rpc NOT ILIKE '%auth.uid()%'
     OR v_unlock_rpc NOT ILIKE '%mfa verification is required%'
     OR v_unlock_rpc NOT ILIKE '%claim_unlocked%' THEN
    RAISE EXCEPTION 'Claim unlock lacks actor, MFA, or audit-log enforcement';
  END IF;

  SELECT pg_get_indexdef('public.hospital_claims_request_id_key'::regclass)
    INTO v_request_index;
  IF v_request_index NOT ILIKE '%UNIQUE%'
     OR v_request_index NOT ILIKE '%request_id%' THEN
    RAISE EXCEPTION 'The unique claim-per-authorization backstop is missing';
  END IF;

  SELECT pg_get_indexdef('public.hospital_claims_auth_code_key'::regclass)
    INTO v_auth_code_index;
  IF v_auth_code_index NOT ILIKE '%UNIQUE%'
     OR v_auth_code_index NOT ILIKE '%auth_code%' THEN
    RAISE EXCEPTION 'The unique claim-per-authorization-code backstop is missing';
  END IF;

  IF has_function_privilege('anon', 'public.rpc_unlock_hospital_claim(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous callers must not unlock claims';
  END IF;
END;
$$;
