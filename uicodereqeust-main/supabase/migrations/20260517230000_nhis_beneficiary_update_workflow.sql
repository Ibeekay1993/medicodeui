CREATE TABLE IF NOT EXISTS public.nhis_update_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid REFERENCES auth.users(id),
  administrator_name text,
  original_filename text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'validated', 'processing', 'completed', 'failed', 'restored')),
  pdf_path text,
  csv_path text,
  xlsx_path text,
  total_records integer NOT NULL DEFAULT 0,
  unique_policy_numbers integer NOT NULL DEFAULT 0,
  duplicate_records integer NOT NULL DEFAULT 0,
  missing_fields integer NOT NULL DEFAULT 0,
  invalid_dates integer NOT NULL DEFAULT 0,
  hcp_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_record_count integer,
  new_record_count integer,
  records_added integer,
  records_removed integer,
  processing_ms integer,
  logs text[] NOT NULL DEFAULT '{}',
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nhis_update_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.nhis_update_runs(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  policy_number text NOT NULL,
  member_type text NOT NULL,
  first_name text NOT NULL,
  surname text NOT NULL,
  full_name text NOT NULL,
  gender text,
  dob text,
  hcp_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, row_number)
);

CREATE TABLE IF NOT EXISTS public.nhis_beneficiaries_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.nhis_update_runs(id) ON DELETE CASCADE,
  beneficiary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nhis_update_runs_created_at
  ON public.nhis_update_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nhis_update_staging_run_id
  ON public.nhis_update_staging(run_id);

CREATE INDEX IF NOT EXISTS idx_nhis_backup_run_id
  ON public.nhis_beneficiaries_backup(run_id);

ALTER TABLE public.nhis_update_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhis_update_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhis_beneficiaries_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage NHIS update runs" ON public.nhis_update_runs;
CREATE POLICY "Admins manage NHIS update runs"
  ON public.nhis_update_runs
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage NHIS staging records" ON public.nhis_update_staging;
CREATE POLICY "Admins manage NHIS staging records"
  ON public.nhis_update_staging
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins read NHIS beneficiary backups" ON public.nhis_beneficiaries_backup;
CREATE POLICY "Admins read NHIS beneficiary backups"
  ON public.nhis_beneficiaries_backup
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('nhis-updates', 'nhis-updates', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins manage NHIS update files" ON storage.objects;
CREATE POLICY "Admins manage NHIS update files"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'nhis-updates' AND has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'nhis-updates' AND has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.replace_nhis_beneficiaries(_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_count integer;
  new_count integer;
  added_count integer;
  removed_count integer;
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

  DELETE FROM public.nhis_beneficiaries_backup
  WHERE run_id = _run_id;

  INSERT INTO public.nhis_beneficiaries_backup(run_id, beneficiary)
  SELECT _run_id, to_jsonb(b)
  FROM public.nhis_beneficiaries b;

  WITH added AS (
    SELECT policy_number, member_type, first_name, surname, full_name, gender, dob, hcp_code
    FROM public.nhis_update_staging
    WHERE run_id = _run_id
    EXCEPT
    SELECT policy_number, member_type, first_name, surname, full_name, gender, dob, hcp_code
    FROM public.nhis_beneficiaries
  ),
  removed AS (
    SELECT policy_number, member_type, first_name, surname, full_name, gender, dob, hcp_code
    FROM public.nhis_beneficiaries
    EXCEPT
    SELECT policy_number, member_type, first_name, surname, full_name, gender, dob, hcp_code
    FROM public.nhis_update_staging
    WHERE run_id = _run_id
  )
  SELECT (SELECT count(*) FROM added), (SELECT count(*) FROM removed)
  INTO added_count, removed_count;

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
    records_added = added_count,
    records_removed = removed_count,
    confirmed_at = now(),
    completed_at = now(),
    updated_at = now(),
    logs = logs || ARRAY['Beneficiary table replaced successfully']
  WHERE id = _run_id;

  INSERT INTO public.audit_logs(action, user_id, details, severity)
  VALUES (
    'NHIS_BENEFICIARY_REPLACED',
    auth.uid(),
    jsonb_build_object(
      'run_id', _run_id,
      'previous_record_count', previous_count,
      'new_record_count', new_count,
      'records_added', added_count,
      'records_removed', removed_count
    ),
    'critical'
  );

  RETURN jsonb_build_object(
    'previous_record_count', previous_count,
    'new_record_count', new_count,
    'records_added', added_count,
    'records_removed', removed_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_nhis_beneficiaries(_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  restored_count integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can restore NHIS beneficiaries';
  END IF;

  SELECT count(*) INTO restored_count
  FROM public.nhis_beneficiaries_backup
  WHERE run_id = _run_id;

  IF restored_count = 0 THEN
    RAISE EXCEPTION 'No backup dataset exists for this update';
  END IF;

  DELETE FROM public.nhis_beneficiaries;

  INSERT INTO public.nhis_beneficiaries(
    policy_number,
    member_type,
    first_name,
    surname,
    full_name,
    gender,
    dob,
    plan_code,
    hcp_code,
    created_at
  )
  SELECT
    beneficiary->>'policy_number',
    beneficiary->>'member_type',
    beneficiary->>'first_name',
    beneficiary->>'surname',
    beneficiary->>'full_name',
    beneficiary->>'gender',
    beneficiary->>'dob',
    beneficiary->>'plan_code',
    beneficiary->>'hcp_code',
    COALESCE((beneficiary->>'created_at')::timestamptz, now())
  FROM public.nhis_beneficiaries_backup
  WHERE run_id = _run_id;

  UPDATE public.nhis_update_runs
  SET status = 'restored',
      updated_at = now(),
      logs = logs || ARRAY['Previous beneficiary dataset restored']
  WHERE id = _run_id;

  INSERT INTO public.audit_logs(action, user_id, details, severity)
  VALUES (
    'NHIS_BENEFICIARY_RESTORED',
    auth.uid(),
    jsonb_build_object('run_id', _run_id, 'restored_record_count', restored_count),
    'critical'
  );

  RETURN jsonb_build_object('restored_record_count', restored_count);
END;
$$;
