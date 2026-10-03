-- Give the Utilization Manager Lead the narrow department-level powers requested:
-- unlock/lock decided authorizations, resolve deletion requests, and update NHIS data.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.role = _role
        OR (
          _role IN ('nurse'::public.app_role, 'utilization_manager'::public.app_role)
          AND ur.role = 'utilization_manager_lead'::public.app_role
        )
        OR (_role = 'nurse'::public.app_role AND ur.role = 'utilization_manager'::public.app_role)
        OR (_role = 'utilization_manager'::public.app_role AND ur.role = 'nurse'::public.app_role)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_authorization_lock(
  p_request_id uuid,
  p_is_unlocked boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Utilization Lead or Super Admin access required.';
  END IF;

  SELECT status INTO v_status
  FROM public.authorization_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authorization request not found.';
  END IF;

  IF lower(coalesce(v_status, '')) NOT IN ('approved', 'partially_approved', 'rejected', 'referral_approved') THEN
    RAISE EXCEPTION 'Only decided authorizations can be unlocked or re-locked.';
  END IF;

  UPDATE public.authorization_requests
  SET is_unlocked = p_is_unlocked
  WHERE id = p_request_id;

  INSERT INTO public.authorization_logs(request_id, action, performed_by, details)
  VALUES (
    p_request_id,
    CASE WHEN p_is_unlocked THEN 'UNLOCK_RECORD_FOR_REVISION' ELSE 'LOCK_RECORD_AFTER_REVISION' END,
    auth.uid(),
    jsonb_build_object('is_unlocked', p_is_unlocked, 'changed_at', now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_set_authorization_lock(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_authorization_lock(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_request_deletion_approval(
  p_request_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'utilization_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'claims'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: internal staff access required.';
  END IF;

  UPDATE public.authorization_requests
  SET deletion_status = 'awaiting_admin_approval',
      deletion_requested_at = now(),
      deletion_requested_by = auth.uid(),
      deletion_reason = nullif(trim(p_reason), '')
  WHERE id = p_request_id
    AND coalesce(deletion_status, 'none') <> 'awaiting_admin_approval';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already awaiting deletion approval.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_request_deletion_approval(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_deletion_approval(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_resolve_delete_request(p_request_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deletion_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Utilization Lead or Super Admin access required.';
  END IF;

  IF p_action NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Unsupported delete action: %', p_action;
  END IF;

  SELECT deletion_status INTO v_deletion_status
  FROM public.authorization_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_deletion_status <> 'awaiting_admin_approval' THEN
    RAISE EXCEPTION 'Deletion request is missing or is no longer awaiting review.';
  END IF;

  IF p_action = 'rejected' THEN
    PERFORM set_config('app.delete_request_resolution', 'true', true);
    UPDATE public.authorization_requests
    SET deletion_status = 'rejected', deletion_reviewed_at = now()
    WHERE id = p_request_id;
    RETURN;
  END IF;

  -- The guard trigger only permits a lead to change a pending deletion status
  -- from inside this reviewed RPC path.
  PERFORM set_config('app.delete_request_resolution', 'true', true);
  UPDATE public.authorization_requests
  SET deletion_status = 'approved', deletion_reviewed_at = now()
  WHERE id = p_request_id;

  PERFORM public.permanently_delete_authorization(p_request_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_resolve_delete_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_delete_request(uuid, text) TO authenticated;

-- This helper is callable only through the approval RPC, which verifies the
-- reviewer role and pending request state before invoking it.
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
       OR auth_code = auth_row.authorization_code
       OR policy_number = auth_row.policy_number
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
       OR auth_code = auth_row.authorization_code
       OR policy_number = auth_row.policy_number
    RETURNING id
  )
  SELECT count(*) INTO deleted_claims FROM deleted_claim_rows;

  DELETE FROM public.authorization_logs WHERE request_id = _request_id;
  DELETE FROM public.audit_logs
  WHERE details->>'request_id' = _request_id::text
     OR details->>'auth_code' = auth_row.authorization_code
     OR details->>'policy_number' = auth_row.policy_number;

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

-- Replace the legacy generic deletion RPC with the audited approval queue.
CREATE OR REPLACE FUNCTION public.rpc_delete_authorization_request(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.rpc_request_deletion_approval(p_request_id, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_authorization_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_authorization_request(uuid, text) TO authenticated;

-- Disable the obsolete direct-delete RPC so all permanent deletion flows use
-- rpc_resolve_delete_request and its pending-request checks.
REVOKE ALL ON FUNCTION public.rpc_hard_delete_authorization_request(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.freeze_authorization_awaiting_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

  IF coalesce(OLD.deletion_status, 'none') = 'awaiting_admin_approval'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    IF NOT (
      public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)
      AND current_setting('app.delete_request_resolution', true) = 'true'
      AND NEW.deletion_status IN ('approved', 'rejected')
    ) THEN
      RAISE EXCEPTION 'Request is pending deletion and can only be changed by the review workflow.';
    END IF;
  END IF;

  IF coalesce(NEW.deletion_status, 'none') = 'awaiting_admin_approval'
     AND coalesce(OLD.deletion_status, 'none') IS DISTINCT FROM coalesce(NEW.deletion_status, 'none') THEN
    NEW.previous_authorization_code := coalesce(nullif(OLD.authorization_code, ''), nullif(NEW.authorization_code, ''), NEW.previous_authorization_code);
    NEW.authorization_code := NULL;
    NEW.approval_code_invalidated_at := now();
    NEW.approval_code_invalidated_reason := 'Request entered awaiting deletion approval status';

    PERFORM public.write_audit_log(
      'AUTHORIZATION_CODE_REVOKED_FOR_DELETE_REQUEST', 'authorization_request', NEW.id::text,
      jsonb_build_object('deletion_status', OLD.deletion_status, 'authorization_code', OLD.authorization_code, 'claim_status', OLD.claim_status),
      jsonb_build_object('deletion_status', NEW.deletion_status, 'authorization_code', NEW.authorization_code,
        'previous_authorization_code', NEW.previous_authorization_code, 'claim_status', NEW.claim_status),
      'Authorization code revoked because request is awaiting deletion approval', 'critical',
      jsonb_build_object('request_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS freeze_authorization_awaiting_delete_trigger ON public.authorization_requests;
CREATE TRIGGER freeze_authorization_awaiting_delete_trigger
BEFORE UPDATE ON public.authorization_requests
FOR EACH ROW EXECUTE FUNCTION public.freeze_authorization_awaiting_delete();

DROP POLICY IF EXISTS "Admins manage NHIS update runs" ON public.nhis_update_runs;
CREATE POLICY "Utilization leads manage NHIS update runs"
  ON public.nhis_update_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role));

DROP POLICY IF EXISTS "Admins manage NHIS staging records" ON public.nhis_update_staging;
CREATE POLICY "Utilization leads manage NHIS staging records"
  ON public.nhis_update_staging FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role));

DROP POLICY IF EXISTS "Admins manage NHIS update files" ON storage.objects;
CREATE POLICY "Utilization leads manage NHIS update files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'nhis-updates' AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)))
  WITH CHECK (bucket_id = 'nhis-updates' AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)));

DROP POLICY IF EXISTS "Admins can view all archived deleted authorizations" ON public.archived_deleted_authorizations;
CREATE POLICY "Admin and utilization leads can view deleted authorization archive"
  ON public.archived_deleted_authorizations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role));

CREATE OR REPLACE FUNCTION public.replace_nhis_beneficiaries(_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_count integer;
  new_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Utilization Lead or Super Admin access required.';
  END IF;

  PERFORM 1 FROM public.nhis_update_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NHIS update run not found.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.nhis_update_runs
    WHERE id = _run_id AND (duplicate_records > 0 OR missing_fields > 0 OR invalid_dates > 0)
  ) THEN
    RAISE EXCEPTION 'Validation failed. Resolve duplicates, missing fields, or invalid dates before replacement.';
  END IF;

  SELECT count(*) INTO new_count FROM public.nhis_update_staging WHERE run_id = _run_id;
  IF new_count = 0 THEN RAISE EXCEPTION 'No staged beneficiary records found for this update'; END IF;

  SELECT count(*) INTO previous_count FROM public.nhis_beneficiaries;
  DELETE FROM public.nhis_beneficiaries WHERE true;

  INSERT INTO public.nhis_beneficiaries(
    policy_number, member_type, first_name, surname, full_name, gender, dob, hcp_code
  )
  SELECT policy_number, member_type, first_name, surname, full_name, gender, dob, hcp_code
  FROM public.nhis_update_staging
  WHERE run_id = _run_id
  ORDER BY row_number;

  UPDATE public.nhis_update_runs
  SET status = 'completed', previous_record_count = previous_count,
      new_record_count = new_count, records_added = new_count,
      records_removed = previous_count, confirmed_at = now(), completed_at = now(),
      updated_at = now(),
      logs = logs || ARRAY['Beneficiary table replaced. No backup retained by policy.']
  WHERE id = _run_id;

  INSERT INTO public.audit_logs(action, user_id, details, severity)
  VALUES (
    'NHIS_BENEFICIARY_REPLACED', auth.uid(),
    jsonb_build_object('run_id', _run_id, 'previous_record_count_deleted', previous_count,
      'new_record_count', new_count, 'backup_retained', false),
    'critical'
  );

  RETURN jsonb_build_object('previous_record_count_deleted', previous_count,
    'new_record_count', new_count, 'backup_retained', false);
END;
$$;
