-- =========================================================================================
-- Migration: Tighten Hospital-to-Backoffice Claims Pipeline and Request State Sync
-- Purpose:
-- 1. Provide atomic RPC `rpc_submit_new_hospital_claim` to prevent stuck drafts, race conditions,
--    and enforce clinical validation rules at the database level.
-- 2. Upgrade `rpc_update_claim_status` to synchronize claim audit ledger and update
--    `authorization_requests.claim_status` in real-time.
-- 3. Add audit trail logging for all hospital claim submissions and audits.
-- =========================================================================================

BEGIN;

-- 1. Atomic claim submission RPC
CREATE OR REPLACE FUNCTION public.rpc_submit_new_hospital_claim(
  p_request_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_auth_req RECORD;
  v_hospital_id UUID;
  v_user_id UUID := auth.uid();
  v_claim_id UUID;
  v_claim_number TEXT;
  v_claim_owner_id UUID;
  v_approved_items JSONB;
BEGIN
  -- 1. Verify caller has hospital role
  IF NOT public.has_role(v_user_id, 'hospital'::public.app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Only authorized hospital providers can submit claims.';
  END IF;

  -- 2. Resolve caller facility
  SELECT ur.hospital_id INTO v_hospital_id
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id AND ur.role = 'hospital'::public.app_role;

  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: No hospital facility is linked to your user account.';
  END IF;

  -- 3. Fetch authorization request with row-level lock
  SELECT * INTO v_auth_req
  FROM public.authorization_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authorization request not found.';
  END IF;

  -- 4. Clinical eligibility checks
  IF lower(v_auth_req.status) NOT IN ('approved', 'authorization_approved') THEN
    RAISE EXCEPTION 'Ineligible: Only approved authorization requests can be claimed.';
  END IF;

  IF v_auth_req.authorization_code IS NULL OR trim(v_auth_req.authorization_code) = '' THEN
    RAISE EXCEPTION 'Ineligible: Authorization request does not have a valid authorization code.';
  END IF;

  IF v_auth_req.authorization_code LIKE 'REF/%' THEN
    RAISE EXCEPTION 'Ineligible: Referral authorization codes cannot be claimed directly before receiving hospital treatment approval.';
  END IF;

  IF v_auth_req.deletion_status = 'awaiting_admin_approval' OR lower(coalesce(v_auth_req.status, '')) IN ('awaiting_delete', 'deleted', 'withdrawn') THEN
    RAISE EXCEPTION 'Ineligible: This authorization request is frozen and awaiting administrative action.';
  END IF;

  -- 5. Facility ownership check
  v_claim_owner_id := COALESCE(v_auth_req.referred_hospital_id, v_auth_req.claiming_hospital_id, v_auth_req.hospital_id);
  IF v_claim_owner_id != v_hospital_id THEN
    RAISE EXCEPTION 'Unauthorized: Your facility is not designated as the claiming provider for this authorization.';
  END IF;

  -- 6. Duplicate check
  IF EXISTS (SELECT 1 FROM public.hospital_claims WHERE request_id = p_request_id) THEN
    RAISE EXCEPTION 'Duplicate: A claim has already been submitted for this authorization request.';
  END IF;

  -- 7. Insert the claim directly as 'submitted'
  v_claim_number := 'CLM-' || v_auth_req.authorization_code;
  v_approved_items := COALESCE(v_auth_req.approved_items, '[]'::jsonb);

  INSERT INTO public.hospital_claims (
    hospital_id,
    hospital_name,
    request_id,
    claim_number,
    auth_code,
    patient_name,
    policy_number,
    diagnosis,
    approved_for,
    status,
    total_amount,
    original_amount,
    approved_amount,
    declined_amount,
    notes,
    approved_items,
    line_items,
    requesting_hospital_id,
    requesting_hospital_name,
    referring_hospital_id,
    referring_hospital_name,
    referred_hospital_id,
    referred_hospital_name,
    claiming_hospital_id,
    claiming_hospital_name,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    v_hospital_id,
    COALESCE(v_auth_req.claiming_hospital_name, v_auth_req.hospital_name),
    v_auth_req.id,
    v_claim_number,
    v_auth_req.authorization_code,
    v_auth_req.patient_name,
    v_auth_req.policy_number,
    COALESCE(v_auth_req.diagnosis, 'Not Specified'),
    COALESCE(v_auth_req.treatment, 'N/A'),
    'submitted',
    COALESCE(v_auth_req.total_amount, 0),
    COALESCE(v_auth_req.total_amount, 0),
    COALESCE(v_auth_req.total_amount, 0),
    0,
    COALESCE(p_notes, 'Automated claim submission for auth ' || v_auth_req.authorization_code),
    v_approved_items,
    v_approved_items,
    COALESCE(v_auth_req.requesting_hospital_id, v_auth_req.hospital_id),
    COALESCE(v_auth_req.requesting_hospital_name, v_auth_req.hospital_name),
    COALESCE(v_auth_req.referring_hospital_id, v_auth_req.hospital_id),
    COALESCE(v_auth_req.referring_hospital_name, v_auth_req.hospital_name),
    v_auth_req.referred_hospital_id,
    v_auth_req.referred_hospital_name,
    v_hospital_id,
    COALESCE(v_auth_req.claiming_hospital_name, v_auth_req.hospital_name),
    v_user_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_claim_id;

  -- 8. Synchronize the authorization request
  UPDATE public.authorization_requests
  SET claimed = true,
      claim_status = 'submitted',
      updated_at = NOW()
  WHERE id = p_request_id;

  -- 9. Insert audit log
  INSERT INTO public.audit_logs (
    action,
    action_type,
    user_id,
    actor_user_id,
    actor_role,
    entity_type,
    entity_id,
    details,
    severity
  ) VALUES (
    'claim_submitted',
    'claim_submission',
    v_user_id,
    v_user_id,
    'hospital',
    'hospital_claims',
    v_claim_id::text,
    jsonb_build_object(
      'claim_id', v_claim_id,
      'claim_number', v_claim_number,
      'request_id', p_request_id,
      'auth_code', v_auth_req.authorization_code,
      'amount', v_auth_req.total_amount,
      'hospital_id', v_hospital_id
    ),
    'info'
  );

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', v_claim_id,
    'claim_number', v_claim_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_new_hospital_claim(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_submit_new_hospital_claim(UUID, TEXT) TO authenticated, service_role;

-- 2. Upgrade rpc_update_claim_status to fully synchronize claims and authorization requests
CREATE OR REPLACE FUNCTION public.rpc_update_claim_status(
  p_claim_id UUID,
  p_status TEXT,
  p_details JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_user_id UUID := auth.uid();
  v_request_id UUID;
  v_contest_deadline TIMESTAMPTZ := NULL;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_roles.user_id = v_user_id;
  IF v_role NOT IN ('admin', 'claims', 'finance') THEN
    RAISE EXCEPTION 'Unauthorized: Only admin, claims, or finance officers can update claim status.';
  END IF;

  -- Calculate 7-day contest deadline for partially approved claims
  IF p_status = 'partially_approved' THEN
    v_contest_deadline := NOW() + INTERVAL '7 days';
  END IF;

  -- 1. Update the claim with full audited ledger values
  UPDATE public.hospital_claims 
  SET status = p_status, 
      approved_amount = COALESCE((p_details->>'approved_amount')::numeric, approved_amount),
      declined_amount = COALESCE((p_details->>'declined_amount')::numeric, declined_amount),
      total_amount = COALESCE((p_details->>'total_amount')::numeric, (p_details->>'approved_amount')::numeric, total_amount),
      original_amount = COALESCE((p_details->>'original_amount')::numeric, original_amount),
      audit_note = COALESCE(p_details->>'audit_note', audit_note),
      notes = COALESCE(p_details->>'notes', notes),
      audit_items = COALESCE(p_details->'audit_items', audit_items),
      audit_summary = COALESCE(p_details->'audit_summary', audit_summary),
      line_items = COALESCE(p_details->'line_items', line_items),
      payment_status = COALESCE(p_details->>'payment_status', payment_status),
      contest_deadline = COALESCE(v_contest_deadline, contest_deadline),
      audited_by = v_user_id,
      audited_at = NOW(),
      updated_at = NOW()
  WHERE id = p_claim_id
  RETURNING request_id INTO v_request_id;

  -- 2. Synchronize the authorization request status
  IF v_request_id IS NOT NULL THEN
    UPDATE public.authorization_requests
    SET claim_status = p_status,
        updated_at = NOW()
    WHERE id = v_request_id;
  END IF;

  -- 3. Audit log
  INSERT INTO public.audit_logs (
    action,
    action_type,
    user_id,
    actor_user_id,
    actor_role,
    entity_type,
    entity_id,
    details,
    severity
  ) VALUES (
    'claim_audit_updated',
    'claim_audit',
    v_user_id,
    v_user_id,
    v_role,
    'hospital_claims',
    p_claim_id::text,
    jsonb_build_object(
      'status', p_status,
      'approved_amount', (p_details->>'approved_amount')::numeric,
      'declined_amount', (p_details->>'declined_amount')::numeric,
      'request_id', v_request_id
    ),
    'info'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_claim_status(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_claim_status(UUID, TEXT, JSONB) TO authenticated, service_role;

COMMIT;
