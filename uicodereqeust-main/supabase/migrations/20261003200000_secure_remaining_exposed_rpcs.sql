BEGIN;

-- Keep the invitation status lookup bound to the user represented by the
-- invitation JWT. The anon key alone must not reveal another user's role.
CREATE OR REPLACE FUNCTION public.check_invite_status(p_user_id uuid)
RETURNS TABLE(role public.app_role, hospital_id uuid, invite_status text, onboarding_completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Invitation identity does not match the signed-in user.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT ur.role, ur.hospital_id, ur.invite_status, ur.onboarding_completed
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.check_invite_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_invite_status(uuid) TO authenticated, service_role;

-- A hospital-link repair may only operate on the authenticated account's own
-- verified email. This preserves the login repair flow without allowing links
-- to be forged for another user.
CREATE OR REPLACE FUNCTION public.heal_hospital_user_link(p_user_id uuid, p_email text)
RETURNS TABLE(out_role text, out_full_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions, pg_temp
AS $$
DECLARE
  v_hospital record;
  v_existing record;
  v_hospital_name text;
  v_hospital_id uuid;
  v_token_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id
     OR v_token_email = '' OR v_token_email <> lower(trim(coalesce(p_email, ''))) THEN
    RAISE EXCEPTION 'Hospital profile repair is only available to the account owner.' USING ERRCODE = '42501';
  END IF;

  SELECT ur.role::text, ur.full_name, ur.hospital_id
  INTO v_existing
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;

  IF FOUND THEN
    IF v_existing.role = 'hospital' THEN
      SELECT h.id, h.name INTO v_hospital_id, v_hospital_name
      FROM public.hospitals h
      WHERE h.user_id = p_user_id OR (h.user_id IS NULL AND lower(trim(h.email)) = v_token_email)
      LIMIT 1;
      IF v_hospital_id IS NOT NULL THEN
        UPDATE public.hospitals h SET user_id = p_user_id
        WHERE h.id = v_hospital_id AND (h.user_id IS NULL OR h.user_id = p_user_id);
        IF v_existing.hospital_id IS NULL THEN
          UPDATE public.user_roles ur SET hospital_id = v_hospital_id WHERE ur.user_id = p_user_id;
        END IF;
      END IF;
      RETURN QUERY SELECT v_existing.role, coalesce(v_hospital_name, v_existing.full_name);
    ELSE
      RETURN QUERY SELECT v_existing.role, v_existing.full_name;
    END IF;
    RETURN;
  END IF;

  SELECT h.* INTO v_hospital FROM public.hospitals h
  WHERE lower(trim(h.email)) = v_token_email LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.user_roles (user_id, role, full_name, hospital_id)
  VALUES (p_user_id, 'hospital', v_hospital.name, v_hospital.id)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        hospital_id = coalesce(public.user_roles.hospital_id, EXCLUDED.hospital_id);
  UPDATE public.hospitals SET user_id = p_user_id
  WHERE id = v_hospital.id AND (user_id IS NULL OR user_id = p_user_id);
  RETURN QUERY SELECT 'hospital'::text, v_hospital.name;
END;
$$;
REVOKE ALL ON FUNCTION public.heal_hospital_user_link(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.heal_hospital_user_link(uuid, text) TO authenticated, service_role;

-- Do not trust a caller-supplied administrator UUID when deciding a profile
-- name change; verify both identity and role from the JWT.
CREATE OR REPLACE FUNCTION public.decide_profile_name_request(_request_id uuid, _status text, _decided_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_requested_name text;
  v_role text;
  v_hosp_id uuid;
BEGIN
  IF auth.uid() IS NULL OR _decided_by IS DISTINCT FROM auth.uid()
     OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Access denied: only an administrator can resolve name requests.' USING ERRCODE = '42501';
  END IF;
  IF _status IS NULL OR _status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status. Must be approved or rejected';
  END IF;
  SELECT user_id, requested_name, role::text INTO v_user_id, v_requested_name, v_role
  FROM public.profile_name_update_requests WHERE id = _request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending request not found'; END IF;

  UPDATE public.profile_name_update_requests
  SET status = _status, decided_by = auth.uid(), decided_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE id = _request_id;
  IF _status = 'approved' THEN
    UPDATE public.user_roles SET full_name = v_requested_name WHERE user_id = v_user_id;
    IF v_role = 'hospital' THEN
      UPDATE public.hospitals SET name = v_requested_name WHERE user_id = v_user_id RETURNING id INTO v_hosp_id;
      IF v_hosp_id IS NOT NULL THEN
        UPDATE public.authorization_requests SET hospital_name = v_requested_name WHERE hospital_id = v_hosp_id;
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('success', true, 'status', _status, 'role', v_role,
    'applied_name', CASE WHEN _status = 'approved' THEN v_requested_name ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.decide_profile_name_request(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_profile_name_request(uuid, text, uuid) TO authenticated, service_role;

-- Email-based lockout helpers must not mutate another account. Disable the
-- unauthenticated failed-login counter to prevent attackers locking out users;
-- Supabase Auth retains its own rate limiting for failed credentials.
CREATE OR REPLACE FUNCTION public.reset_failed_login(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions, pg_temp
AS $$
DECLARE clean_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  IF auth.uid() IS NULL OR lower(trim(coalesce(auth.jwt() ->> 'email', ''))) <> clean_email THEN
    RAISE EXCEPTION 'Login attempts may only be reset by the account owner.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_roles SET failed_attempts = 0, updated_at = now()
  WHERE user_id = auth.uid() AND lower(trim(email)) = clean_email;
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.reset_failed_login(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_failed_login(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unlock_account_after_reset(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions, pg_temp
AS $$
DECLARE clean_email text := lower(trim(coalesce(p_email, ''))); v_attempts integer; v_status text;
BEGIN
  IF auth.uid() IS NULL OR lower(trim(coalesce(auth.jwt() ->> 'email', ''))) <> clean_email THEN
    RAISE EXCEPTION 'Only the account owner can recover access.' USING ERRCODE = '42501';
  END IF;
  SELECT failed_attempts, access_status INTO v_attempts, v_status
  FROM public.user_roles WHERE user_id = auth.uid() AND lower(trim(email)) = clean_email FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'User not found'); END IF;
  UPDATE public.user_roles
  SET failed_attempts = 0,
      access_status = CASE WHEN v_status = 'revoked' AND v_attempts >= 5 THEN 'active' ELSE access_status END,
      updated_at = now()
  WHERE user_id = auth.uid();
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.unlock_account_after_reset(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_account_after_reset(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_failed_login(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_login(text) TO service_role;

-- NHIS lookup RPCs return member-identifying data. They are not used by the
-- browser; keep them available to trusted server-side callers only.
REVOKE ALL ON FUNCTION public.verify_nhis(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_nhis(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_nhis_family_members(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_nhis_family_members(text) TO service_role;

-- Keep the claim summary behind the same application-role check as the page.
CREATE OR REPLACE FUNCTION public.rpc_get_claims_analysis_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions, pg_temp
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'claims'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
    OR public.has_role(auth.uid(), 'bureau'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: a Claims, Finance, Bureau, or Admin role is required.' USING ERRCODE = '42501';
  END IF;
  WITH claim_stats AS (
    SELECT status, hospital_id, hospital_name, total_amount, created_at::date AS claim_date FROM public.hospital_claims
  ),
  by_status AS (SELECT status, count(*) AS count, sum(total_amount) AS total_amount FROM claim_stats GROUP BY status),
  by_hospital AS (SELECT hospital_id, hospital_name, count(*) AS count, sum(total_amount) AS total_amount FROM claim_stats GROUP BY hospital_id, hospital_name),
  by_date AS (SELECT claim_date, count(*) AS count, sum(total_amount) AS total_amount FROM claim_stats GROUP BY claim_date ORDER BY claim_date DESC LIMIT 10)
  SELECT jsonb_build_object(
    'by_status', (SELECT coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb) FROM by_status s),
    'by_hospital', (SELECT coalesce(jsonb_agg(row_to_json(h)), '[]'::jsonb) FROM by_hospital h),
    'by_date', (SELECT coalesce(jsonb_agg(row_to_json(d)), '[]'::jsonb) FROM by_date d)
  ) INTO result;
  RETURN coalesce(result, '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_get_claims_analysis_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_claims_analysis_summary() TO authenticated, service_role;

-- Enforce NHIS completeness inside the destructive replacement RPC too, so a
-- direct RPC call cannot bypass the dashboard's validation button state.
CREATE OR REPLACE FUNCTION public.replace_nhis_beneficiaries(_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions, pg_temp
AS $$
DECLARE
  run_row public.nhis_update_runs%rowtype;
  previous_count integer;
  new_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Utilization Lead or Super Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO run_row FROM public.nhis_update_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NHIS update run not found.'; END IF;
  IF run_row.duplicate_records > 0 OR run_row.missing_fields > 0 OR run_row.invalid_dates > 0 THEN
    RAISE EXCEPTION 'Validation failed. Resolve duplicates, missing fields, or invalid dates before replacement.';
  END IF;

  SELECT count(*) INTO new_count FROM public.nhis_update_staging WHERE run_id = _run_id;
  IF new_count = 0 THEN RAISE EXCEPTION 'No staged beneficiary records found for this update'; END IF;
  IF run_row.validation_results ->> 'expectedTotal' IS NULL
     OR (run_row.validation_results ->> 'expectedTotal')::integer <> new_count
     OR jsonb_array_length(coalesce(run_row.validation_results -> 'skippedRows', '[]'::jsonb)) > 0
     OR new_count <> run_row.total_records THEN
    RAISE EXCEPTION 'Validation failed. PDF total must match staged records and no rows may be skipped.';
  END IF;

  SELECT count(*) INTO previous_count FROM public.nhis_beneficiaries;
  DELETE FROM public.nhis_beneficiaries WHERE true;
  INSERT INTO public.nhis_beneficiaries(
    policy_number, member_type, first_name, surname, full_name, gender, dob, hcp_code
  )
  SELECT policy_number, member_type, first_name, surname, full_name, gender, dob, hcp_code
  FROM public.nhis_update_staging WHERE run_id = _run_id ORDER BY row_number;

  UPDATE public.nhis_update_runs
  SET status = 'completed', previous_record_count = previous_count,
      new_record_count = new_count, records_added = new_count,
      records_removed = previous_count, confirmed_at = now(), completed_at = now(),
      updated_at = now(), logs = logs || ARRAY['Beneficiary table replaced. No backup retained by policy.']
  WHERE id = _run_id;
  INSERT INTO public.audit_logs(action, user_id, details, severity)
  VALUES ('NHIS_BENEFICIARY_REPLACED', auth.uid(),
    jsonb_build_object('run_id', _run_id, 'previous_record_count_deleted', previous_count,
      'new_record_count', new_count, 'backup_retained', false), 'critical');
  RETURN jsonb_build_object('previous_record_count_deleted', previous_count,
    'new_record_count', new_count, 'backup_retained', false);
END;
$$;

COMMIT;
