-- =========================================================================================
-- Migration: Allow Claim Submissions for Partially Approved Authorizations
-- Purpose:
-- 1. Ensure hospitals can submit claims for both 'approved' AND 'partially_approved' requests.
-- 2. Accurate claim total calculation based on approved items for partially approved requests.
-- =========================================================================================

BEGIN;

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
  v_claim_amount NUMERIC;
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

  -- 4. Clinical eligibility checks: ALLOW both approved and partially_approved
  IF lower(v_auth_req.status) NOT IN ('approved', 'authorization_approved', 'partially_approved') THEN
    RAISE EXCEPTION 'Ineligible: Only approved or partially approved authorization requests can be claimed.';
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
  v_claim_amount := COALESCE(v_auth_req.total_amount, 0);

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
    v_claim_amount,
    v_claim_amount,
    v_claim_amount,
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
      'amount', v_claim_amount,
      'hospital_id', v_hospital_id,
      'auth_status', v_auth_req.status
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

COMMIT;
