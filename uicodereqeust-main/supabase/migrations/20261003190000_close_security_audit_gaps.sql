BEGIN;

-- These RPCs have no browser call sites. Prevent signed-in clients from
-- enumerating member details or writing audit entries with a forged actor ID.
REVOKE ALL ON FUNCTION public.verify_policy(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_policy(text) TO service_role;

REVOKE ALL ON FUNCTION public.write_audit_log(
  text, text, text, jsonb, jsonb, text, text, jsonb, uuid, inet, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_audit_log(
  text, text, text, jsonb, jsonb, text, text, jsonb, uuid, inet, text
) TO service_role;

REVOKE ALL ON FUNCTION public.actor_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actor_snapshot(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_audit_log(text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_audit_log(text, jsonb, text) TO service_role;

-- The MFA RPCs enforce admin checks internally; also keep unauthenticated
-- callers out of the exposed RPC surface. The historical wipe is similarly
-- admin-checked and remains available to signed-in administrators.
REVOKE ALL ON FUNCTION public.admin_get_users_mfa_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_users_mfa_status() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_unenroll_mfa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unenroll_mfa(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.wipe_historical_codes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wipe_historical_codes() TO authenticated;

-- Payment batch RPCs run as the database owner and bypass table RLS, so all
-- finance permission and claim consistency checks must happen inside the RPC.
CREATE OR REPLACE FUNCTION public.create_payment_batch_transactional(
  p_batch_reference text,
  p_provider_id uuid,
  p_month text,
  p_total_claims integer,
  p_total_amount numeric,
  p_created_by uuid,
  p_claim_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid;
  v_claim_count integer;
  v_total_amount numeric(12,2);
  v_updated_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Finance or Super Admin access required.';
  END IF;
  IF p_created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Batch creator must match the signed-in user.';
  END IF;
  IF nullif(trim(p_batch_reference), '') IS NULL OR p_provider_id IS NULL
     OR p_month IS NULL OR p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'A valid batch reference, provider, and YYYY-MM month are required.';
  END IF;
  IF p_claim_ids IS NULL OR cardinality(p_claim_ids) = 0 THEN
    RAISE EXCEPTION 'Select at least one claim for the payment batch.';
  END IF;

  -- Lock selected claims before validating so concurrent batches cannot claim
  -- the same payable rows.
  PERFORM id
  FROM public.hospital_claims
  WHERE id = ANY(p_claim_ids)
  ORDER BY id
  FOR UPDATE;

  SELECT count(*)::integer,
         round(coalesce(sum(coalesce(approved_amount, total_amount, 0)), 0), 2)
  INTO v_claim_count, v_total_amount
  FROM public.hospital_claims
  WHERE id = ANY(p_claim_ids)
    AND hospital_id = p_provider_id
    AND status IN ('approved', 'partially_approved')
    AND coalesce(payment_status, 'awaiting_payment') = 'awaiting_payment'
    AND payment_batch_id IS NULL;

  IF v_claim_count <> cardinality(p_claim_ids) THEN
    RAISE EXCEPTION 'One or more selected claims are unavailable, already batched, or do not belong to this provider.';
  END IF;

  INSERT INTO public.payment_batches (
    batch_reference, provider_id, month, total_claims, total_amount, status, created_by
  ) VALUES (
    trim(p_batch_reference), p_provider_id, p_month, v_claim_count, v_total_amount, 'draft', auth.uid()
  ) RETURNING id INTO v_batch_id;

  UPDATE public.hospital_claims
  SET payment_batch_id = v_batch_id, payment_status = 'batched'
  WHERE id = ANY(p_claim_ids)
    AND hospital_id = p_provider_id
    AND status IN ('approved', 'partially_approved')
    AND coalesce(payment_status, 'awaiting_payment') = 'awaiting_payment'
    AND payment_batch_id IS NULL;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count <> v_claim_count THEN
    RAISE EXCEPTION 'Payment batch selection changed during processing. Please retry.';
  END IF;

  RETURN v_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_batch_transactional(
  text, uuid, text, integer, numeric, uuid, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payment_batch_transactional(
  text, uuid, text, integer, numeric, uuid, uuid[]
) TO authenticated, service_role;

-- Permanent deletion must match claims to this authorization, never to the
-- member's policy number alone (one member can have many unrelated claims).
CREATE OR REPLACE FUNCTION public.permanently_delete_authorization(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_row public.authorization_requests%rowtype;
  deleted_claims integer := 0;
  deleted_lines integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Utilization Lead or Super Admin access required.';
  END IF;

  SELECT * INTO auth_row
  FROM public.authorization_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF auth_row.id IS NULL THEN
    RAISE EXCEPTION 'Authorization request not found';
  END IF;
  IF auth_row.deletion_status <> 'approved' THEN
    RAISE EXCEPTION 'Authorization must have an approved deletion request.';
  END IF;

  WITH target_claims AS (
    SELECT id FROM public.hospital_claims
    WHERE request_id = _request_id
       OR (auth_row.authorization_code IS NOT NULL AND auth_code = auth_row.authorization_code)
  ), deleted_claim_lines AS (
    DELETE FROM public.hospital_claim_lines hcl
    USING target_claims tc
    WHERE hcl.claim_id = tc.id
    RETURNING hcl.id
  )
  SELECT count(*) INTO deleted_lines FROM deleted_claim_lines;

  WITH deleted_claim_rows AS (
    DELETE FROM public.hospital_claims
    WHERE request_id = _request_id
       OR (auth_row.authorization_code IS NOT NULL AND auth_code = auth_row.authorization_code)
    RETURNING id
  )
  SELECT count(*) INTO deleted_claims FROM deleted_claim_rows;

  DELETE FROM public.authorization_logs WHERE request_id = _request_id;
  DELETE FROM public.audit_logs
  WHERE details->>'request_id' = _request_id::text
     OR (auth_row.authorization_code IS NOT NULL AND details->>'auth_code' = auth_row.authorization_code);

  INSERT INTO public.archived_deleted_authorizations (
    original_request_id, patient_name, policy_number, diagnosis, treatment,
    total_amount, hospital_name, authorization_code, deleted_by,
    deletion_reason, deleted_claims_count, deleted_claim_lines_count
  ) VALUES (
    _request_id, auth_row.patient_name, auth_row.policy_number, auth_row.diagnosis,
    auth_row.treatment, auth_row.total_amount, auth_row.hospital_name,
    auth_row.authorization_code, auth.uid(), auth_row.deletion_reason,
    deleted_claims, deleted_lines
  );

  DELETE FROM public.authorization_requests WHERE id = _request_id;

  INSERT INTO public.audit_logs(action, user_id, details, severity)
  VALUES (
    'AUTHORIZATION_PERMANENT_DELETE', auth.uid(),
    jsonb_build_object(
      'request_id', _request_id,
      'authorization_code', auth_row.authorization_code,
      'policy_number', auth_row.policy_number,
      'patient_name', auth_row.patient_name,
      'deleted_claims', deleted_claims,
      'deleted_claim_lines', deleted_lines
    ),
    'critical'
  );

  RETURN jsonb_build_object(
    'request_id', _request_id,
    'deleted_claims', deleted_claims,
    'deleted_claim_lines', deleted_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.permanently_delete_authorization(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_authorization(uuid) TO service_role;

COMMIT;
