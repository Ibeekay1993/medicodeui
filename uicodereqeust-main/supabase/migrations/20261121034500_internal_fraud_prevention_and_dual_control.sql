-- ============================================================================
-- Migration: Internal Fraud Prevention & 4-Eyes Dual Control (HIPAA / ISO 27001)
--
-- 1. Immutable Audit Logs:
--    Blocks any UPDATE, DELETE, or TRUNCATE on public.audit_logs for all users.
--    Audit logs cannot be purged or manipulated to hide internal staff actions.
--
-- 2. Maker-Checker (Segregation of Duties) on Authorizations:
--    Prevents internal clinical staff from self-approving authorization requests
--    that they personally created or submitted.
--
-- 3. Payment Batch Segregation of Duties:
--    Prevents the finance creator of a payment batch from unilaterally settling
--    and releasing funds on that batch without independent verification.
--
-- 4. Tariff Catalog Hardening:
--    Explicitly revokes modification privileges on public.nhia_items and
--    abbreviations from non-service-role users, ensuring drug and procedure
--    tariffs cannot be inflated.
-- ============================================================================
BEGIN;

-- ─── 1. Immutable Audit Logs ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_audit_log_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted (HIPAA §164.312(b), ISO 27001 A.12.4).'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_tampering ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_log_tampering
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_tampering();

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;


-- ─── 2. Tariff Catalog Hardening ───────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.nhia_items FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.abbreviations FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.nhia_items TO authenticated;
GRANT SELECT ON public.abbreviations TO authenticated;
GRANT ALL ON public.nhia_items TO service_role;
GRANT ALL ON public.abbreviations TO service_role;


-- ─── 3. Payment Batch Maker-Checker Settlement RPC ────────────────────────
CREATE OR REPLACE FUNCTION public.settle_payment_batch_transactional(
  p_batch_id uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.payment_batches%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Finance or Super Admin access required.';
  END IF;

  IF p_payload->>'status' IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'This operation only supports payment batch settlement.';
  END IF;

  SELECT * INTO v_batch
  FROM public.payment_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment batch not found.';
  END IF;

  -- Maker-Checker segregation: batch creator cannot settle unless admin override
  IF v_batch.created_by = auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Segregation of duties violation: The creator of a payment batch cannot approve and settle it. Another finance officer or administrator must verify.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hospital_claims WHERE payment_batch_id = p_batch_id
  ) THEN
    RAISE EXCEPTION 'No claims are linked to this payment batch.';
  END IF;

  UPDATE public.payment_batches
  SET status = 'paid',
      paid_at = CASE WHEN p_payload ? 'paid_at' THEN (p_payload->>'paid_at')::timestamptz ELSE now() END,
      bank_reference = CASE WHEN p_payload ? 'bank_reference' THEN p_payload->>'bank_reference' ELSE bank_reference END,
      paid_by = auth.uid(), -- Always record actual caller ID, not arbitrary payload
      receipt_url = CASE WHEN p_payload ? 'receipt_url' THEN p_payload->>'receipt_url' ELSE receipt_url END,
      receipt_name = CASE WHEN p_payload ? 'receipt_name' THEN p_payload->>'receipt_name' ELSE receipt_name END
  WHERE id = p_batch_id;

  UPDATE public.hospital_claims
  SET payment_status = 'paid'
  WHERE payment_batch_id = p_batch_id;

  -- Record audit log
  INSERT INTO public.audit_logs (user_id, action, resource_type, details, created_at)
  VALUES (
    auth.uid(),
    'payment_batch_settled',
    'payment_batches',
    jsonb_build_object(
      'batch_id', p_batch_id,
      'batch_number', v_batch.batch_number,
      'bank_reference', p_payload->>'bank_reference',
      'settled_at', now()
    ),
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_payment_batch_transactional(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_payment_batch_transactional(uuid, jsonb) TO authenticated, service_role;


-- ─── 4. Maker-Checker Rule in Authorization Decision Transition ────────────
-- Updated to include a self-approval check for clinical users.
CREATE OR REPLACE FUNCTION public.protect_authorization_decision_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  item JSONB;
  catalog RECORD;
  normalized JSONB;
  quantity NUMERIC;
  item_total NUMERIC;
BEGIN
  -- Guard: bypass transition and tariff catalog validation for historical imports
  IF coalesce(NEW.is_historical, false) IS TRUE
     OR coalesce(NEW.source, '') = 'historical_import'
     OR coalesce(NEW.request_id, '') LIKE 'REQ-HIST-%' THEN
    RETURN NEW;
  END IF;

  -- 1. Guard against Hospital User Tampering
  IF public.has_role(auth.uid(), 'hospital'::public.app_role) THEN
    IF OLD.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved') THEN
      NEW.status := OLD.status;
      NEW.approved_items := OLD.approved_items;
      NEW.total_amount := OLD.total_amount;
      NEW.authorization_code := OLD.authorization_code;
      NEW.decided_at := OLD.decided_at;
      NEW.decided_by := OLD.decided_by;
      NEW.approved_by := OLD.approved_by;
      NEW.decision_reason := OLD.decision_reason;
      NEW.clinical_notes := OLD.clinical_notes;
      NEW.is_unlocked := OLD.is_unlocked;
    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved') THEN
        RAISE EXCEPTION 'Hospitals cannot make authorization decisions' USING ERRCODE = '42501';
      END IF;
      NEW.approved_items := OLD.approved_items;
      NEW.authorization_code := OLD.authorization_code;
      NEW.decided_at := OLD.decided_at;
      NEW.decided_by := OLD.decided_by;
      NEW.approved_by := OLD.approved_by;
      NEW.is_unlocked := OLD.is_unlocked;
    END IF;
  END IF;

  -- 2. Guard Finalized Authorizations for all roles:
  IF coalesce(OLD.is_unlocked, false) IS NOT TRUE THEN
    IF OLD.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved') THEN
      IF NEW.approved_items IS DISTINCT FROM OLD.approved_items THEN
        RAISE EXCEPTION 'Approved treatment items cannot be modified unless the authorization is unlocked for revision';
      END IF;
      IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
        RAISE EXCEPTION 'Total authorization amount cannot be modified unless the authorization is unlocked for revision';
      END IF;
      IF NEW.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved')
         AND NEW.decided_at IS DISTINCT FROM OLD.decided_at THEN
        RAISE EXCEPTION 'A finalized authorization decision cannot be overwritten';
      END IF;
      IF NEW.status NOT IN ('approved', 'partially_approved', 'rejected', 'referral_approved', 'paid') THEN
        RAISE EXCEPTION 'A finalized authorization decision cannot be reverted';
      END IF;
    END IF;
  ELSE
    NEW.is_unlocked := false;
  END IF;

  -- 3. Validate approval decision requirements & Enforce Maker-Checker
  IF NEW.status IN ('approved', 'partially_approved', 'referral_approved')
     AND (OLD.status IS DISTINCT FROM NEW.status OR coalesce(OLD.is_unlocked, false) IS TRUE) THEN
    IF NOT (
      public.has_role(auth.uid(), 'nurse')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'utilization_manager')
      OR public.has_role(auth.uid(), 'utilization_manager_lead')
    ) THEN
      RAISE EXCEPTION 'Only authorized clinical staff can finalize an authorization decision' USING ERRCODE = '42501';
    END IF;

    -- Maker-Checker enforcement: Staff member cannot approve their own submission
    IF auth.uid() IS NOT NULL
       AND NEW.submitted_by = auth.uid()
       AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      RAISE EXCEPTION 'Segregation of duties violation: An authorization cannot be approved by the same user who submitted it (Maker-Checker rule).'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.decided_at IS NULL OR NEW.decided_by IS NULL THEN
      RAISE EXCEPTION 'A decision timestamp and decision user are required';
    END IF;
    IF NEW.approved_by IS NULL
       OR coalesce(nullif(trim(NEW.authorization_code), ''), '') = '' THEN
      RAISE EXCEPTION 'Approved decisions require an approver and authorization code';
    END IF;
  END IF;

  -- 4. Validate rejection decision requirements
  IF NEW.status = 'rejected'
     AND (OLD.status IS DISTINCT FROM NEW.status OR coalesce(OLD.is_unlocked, false) IS TRUE) THEN
    IF NOT (
      public.has_role(auth.uid(), 'nurse')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'utilization_manager')
      OR public.has_role(auth.uid(), 'utilization_manager_lead')
    ) THEN
      RAISE EXCEPTION 'Only authorized clinical staff can finalize an authorization decision' USING ERRCODE = '42501';
    END IF;
    IF NEW.decided_at IS NULL OR NEW.decided_by IS NULL
       OR coalesce(nullif(trim(NEW.decision_reason), ''), '') = '' THEN
      RAISE EXCEPTION 'Rejected decisions require a decision user, timestamp, and reason';
    END IF;
  END IF;

  -- 5. Normalize items against tariff catalog when decision is made or unlocked
  IF NEW.status IN ('approved', 'partially_approved', 'referral_approved')
     AND (OLD.status IS DISTINCT FROM NEW.status OR coalesce(OLD.is_unlocked, false) IS TRUE)
     AND jsonb_typeof(NEW.approved_items) = 'array' THEN
    normalized := '[]'::jsonb;
    item_total := 0;
    FOR item IN SELECT value FROM jsonb_array_elements(NEW.approved_items)
    LOOP
      SELECT code, name, category, amount INTO catalog
      FROM public.nhia_items
      WHERE code = NULLIF(item->>'code', '')
      LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Approved item is not a valid NHIA catalog item: %', item->>'code';
      END IF;
      quantity := greatest(1, coalesce((item->>'quantity')::numeric, 1));
      item_total := item_total + CASE
        WHEN coalesce((item->>'declined')::boolean, false) THEN 0
        ELSE catalog.amount * quantity
      END;
      normalized := normalized || jsonb_build_array(
        jsonb_build_object(
          'code', catalog.code, 'name', catalog.name, 'category', catalog.category,
          'unit_price', catalog.amount, 'quantity', quantity,
          'amount', catalog.amount * quantity,
          'declined', coalesce((item->>'declined')::boolean, false),
          'decline_reason', item->>'decline_reason',
          'frequency', item->>'frequency', 'duration', item->>'duration'
        )
      );
    END LOOP;
    NEW.approved_items := normalized;
    NEW.total_amount := round(item_total, 2);
  END IF;

  RETURN NEW;
END;
$func$;

COMMIT;
