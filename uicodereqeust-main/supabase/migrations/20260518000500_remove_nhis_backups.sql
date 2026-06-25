DROP FUNCTION IF EXISTS public.restore_nhis_beneficiaries(uuid);

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
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can replace NHIS beneficiaries';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.nhis_update_runs
    WHERE id = _run_id
      AND (duplicate_records > 0 OR missing_fields > 0 OR invalid_dates > 0)
  ) THEN
    RAISE EXCEPTION 'Validation failed. Resolve duplicates, missing fields, or invalid dates before replacement.';
  END IF;

  SELECT count(*) INTO new_count
  FROM public.nhis_update_staging
  WHERE run_id = _run_id;

  IF new_count = 0 THEN
    RAISE EXCEPTION 'No staged beneficiary records found for this update';
  END IF;

  SELECT count(*) INTO previous_count
  FROM public.nhis_beneficiaries;

  DELETE FROM public.nhis_beneficiaries;

  INSERT INTO public.nhis_beneficiaries(
    policy_number,
    member_type,
    first_name,
    surname,
    full_name,
    gender,
    dob,
    hcp_code
  )
  SELECT
    policy_number,
    member_type,
    first_name,
    surname,
    full_name,
    gender,
    dob,
    hcp_code
  FROM public.nhis_update_staging
  WHERE run_id = _run_id
  ORDER BY row_number;

  UPDATE public.nhis_update_runs
  SET
    status = 'completed',
    previous_record_count = previous_count,
    new_record_count = new_count,
    records_added = new_count,
    records_removed = previous_count,
    confirmed_at = now(),
    completed_at = now(),
    updated_at = now(),
    logs = logs || ARRAY['Beneficiary table replaced. No backup retained by policy.']
  WHERE id = _run_id;

  INSERT INTO public.audit_logs(action, user_id, details, severity)
  VALUES (
    'NHIS_BENEFICIARY_REPLACED',
    auth.uid(),
    jsonb_build_object(
      'run_id', _run_id,
      'previous_record_count_deleted', previous_count,
      'new_record_count', new_count,
      'backup_retained', false
    ),
    'critical'
  );

  RETURN jsonb_build_object(
    'previous_record_count_deleted', previous_count,
    'new_record_count', new_count,
    'backup_retained', false
  );
END;
$$;

DROP TABLE IF EXISTS public.nhis_beneficiaries_backup;
