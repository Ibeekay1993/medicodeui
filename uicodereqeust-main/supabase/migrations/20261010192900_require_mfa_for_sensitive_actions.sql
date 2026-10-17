-- Keep MFA enforcement inside the privileged RPCs, not only in the UI.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_user_mfa_exempt(
  p_user_id UUID,
  p_exempt BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mfa_enforced BOOLEAN := FALSE;
  v_caller_mfa_exempt BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.has_role(auth.uid(), 'admin'::public.app_role)
  THEN
    RAISE EXCEPTION 'Access Denied: Only admins can manage per-user MFA settings'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(gp.value @> '{"enforced": true}'::jsonb, FALSE)
  INTO v_mfa_enforced
  FROM public.global_policies AS gp
  WHERE gp.key = 'enforce_mfa';

  SELECT COALESCE(bool_and(COALESCE(ur.mfa_exempt, FALSE)), FALSE)
  INTO v_caller_mfa_exempt
  FROM public.user_roles AS ur
  WHERE ur.user_id = auth.uid();

  IF COALESCE(v_mfa_enforced, FALSE)
    AND NOT COALESCE(v_caller_mfa_exempt, FALSE)
    AND (auth.jwt() ->> 'aal') IS DISTINCT FROM 'aal2'
  THEN
    RAISE EXCEPTION 'MFA verification is required to manage per-user MFA settings'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_roles
  SET mfa_exempt = p_exempt,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF p_exempt IS TRUE THEN
    DELETE FROM auth.mfa_factors WHERE user_id = p_user_id;
    DELETE FROM auth.mfa_amr_claims
    WHERE session_id IN (
      SELECT id FROM auth.sessions WHERE user_id = p_user_id
    );
  END IF;

  INSERT INTO public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    auth.uid(),
    'ADMIN_SET_MFA_EXEMPTION',
    'user',
    p_user_id,
    jsonb_build_object('target_user_id', p_user_id, 'mfa_exempt', p_exempt)
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', p_user_id,
    'mfa_exempt', p_exempt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_mfa_exempt(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_mfa_exempt(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_claim_to_payment(p_claim_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim RECORD;
  v_role public.app_role;
  v_hospital_id UUID;
  v_mfa_enforced BOOLEAN := FALSE;
  v_caller_mfa_exempt BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(gp.value @> '{"enforced": true}'::jsonb, FALSE)
  INTO v_mfa_enforced
  FROM public.global_policies AS gp
  WHERE gp.key = 'enforce_mfa';

  SELECT COALESCE(bool_and(COALESCE(ur.mfa_exempt, FALSE)), FALSE)
  INTO v_caller_mfa_exempt
  FROM public.user_roles AS ur
  WHERE ur.user_id = auth.uid();

  IF COALESCE(v_mfa_enforced, FALSE)
    AND NOT COALESCE(v_caller_mfa_exempt, FALSE)
    AND (auth.jwt() ->> 'aal') IS DISTINCT FROM 'aal2'
  THEN
    RAISE EXCEPTION 'MFA verification is required to release a claim to payment'
      USING ERRCODE = '42501';
  END IF;

  SELECT role, hospital_id INTO v_role, v_hospital_id
  FROM public.user_roles
  WHERE user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Unassigned Role';
  END IF;

  SELECT * INTO v_claim
  FROM public.hospital_claims
  WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF v_role NOT IN ('admin', 'claims', 'finance') THEN
    IF v_role = 'hospital' AND v_claim.hospital_id = v_hospital_id THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Unauthorized to release this claim to payment';
    END IF;
  END IF;

  IF v_claim.status NOT IN ('approved', 'partially_approved') THEN
    RAISE EXCEPTION 'Only approved or partially approved claims can be released to payment';
  END IF;

  UPDATE public.hospital_claims
  SET payment_status = 'awaiting_payment',
      contest_deadline = LEAST(COALESCE(contest_deadline, NOW()), NOW()),
      updated_at = NOW()
  WHERE id = p_claim_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'claim_id', p_claim_id,
    'payment_status', 'awaiting_payment'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.release_claim_to_payment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_claim_to_payment(UUID) TO authenticated;

COMMIT;
