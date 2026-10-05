BEGIN;

-- Production carries hcp_name in both the staged and live beneficiary tables.
-- Preserve it during activation alongside policy and beneficiary identifiers.
-- Keep the larger function-local timeout required for a full-list replacement.
CREATE OR REPLACE FUNCTION public.replace_nhis_beneficiaries(_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions, pg_temp
SET statement_timeout TO '120s'
AS $$
DECLARE
  run_row public.nhis_update_runs%rowtype;
  previous_count integer;
  new_count integer;
  source_incomplete boolean;
  override_approved boolean;
  override_reason text;
  manual_classification_count integer;
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

  source_incomplete :=
    run_row.validation_results ->> 'expectedTotal' IS NULL
    OR (run_row.validation_results ->> 'expectedTotal')::integer <> new_count
    OR jsonb_array_length(coalesce(run_row.validation_results -> 'skippedRows', '[]'::jsonb)) > 0
    OR jsonb_array_length(coalesce(run_row.validation_results -> 'unclassifiedRows', '[]'::jsonb)) > 0
    OR EXISTS (
      SELECT 1 FROM public.nhis_update_staging
      WHERE run_id = _run_id AND upper(member_type) = 'UNSPECIFIED'
    )
    OR new_count <> run_row.total_records;
  override_approved := coalesce((run_row.validation_results ->> 'allowIncompleteReplacement')::boolean, false);
  override_reason := nullif(trim(run_row.validation_results ->> 'incompleteReplacementReason'), '');
  manual_classification_count := coalesce((run_row.validation_results ->> 'manualMemberTypeAssignments')::integer, 0);

  IF source_incomplete AND (NOT override_approved OR length(coalesce(override_reason, '')) < 10) THEN
    RAISE EXCEPTION 'Validation failed. PDF total must match staged records and all rows must be classified, unless an authorized user explicitly approves the incomplete replacement with a reason.';
  END IF;

  SELECT count(*) INTO previous_count FROM public.nhis_beneficiaries;
  TRUNCATE TABLE public.nhis_beneficiaries;
  INSERT INTO public.nhis_beneficiaries(
    policy_number, beneficiary_number, member_type, first_name, surname,
    full_name, gender, dob, hcp_code, hcp_name
  )
  SELECT policy_number, beneficiary_number, member_type, first_name, surname,
         full_name, gender, dob, hcp_code, hcp_name
  FROM public.nhis_update_staging WHERE run_id = _run_id;

  UPDATE public.nhis_update_runs
  SET status = 'completed', previous_record_count = previous_count,
      new_record_count = new_count, records_added = new_count,
      records_removed = previous_count, confirmed_at = now(), completed_at = now(),
      updated_at = now(),
      logs = logs || ARRAY[CASE WHEN source_incomplete
        THEN 'Incomplete beneficiary list replacement explicitly approved: ' || override_reason
        WHEN manual_classification_count > 0
        THEN 'Beneficiary list replaced after complete validation; ' || manual_classification_count || ' member type(s) classified during review.'
        ELSE 'Beneficiary table replaced after complete validation.' END]
  WHERE id = _run_id;

  INSERT INTO public.audit_logs(action, user_id, details, severity)
  VALUES (
    CASE WHEN source_incomplete THEN 'NHIS_INCOMPLETE_REPLACEMENT_APPROVED' ELSE 'NHIS_BENEFICIARY_REPLACED' END,
    auth.uid(),
    jsonb_build_object(
      'run_id', _run_id,
      'previous_record_count_deleted', previous_count,
      'new_record_count', new_count,
      'incomplete_source', source_incomplete,
      'manual_member_type_assignments', manual_classification_count,
      'override_reason', CASE WHEN source_incomplete THEN override_reason ELSE NULL END,
      'backup_retained', false
    ),
    CASE WHEN source_incomplete THEN 'critical' ELSE 'info' END
  );

  RETURN jsonb_build_object(
    'previous_record_count_deleted', previous_count,
    'new_record_count', new_count,
    'incomplete_source', source_incomplete,
    'backup_retained', false
  );
END;
$$;

COMMIT;
