BEGIN;

-- Drop all existing versions of import_historical_codes to avoid signature ambiguity
DROP FUNCTION IF EXISTS public.import_historical_codes(text, jsonb);
DROP FUNCTION IF EXISTS public.import_historical_codes(text, jsonb, text);

CREATE OR REPLACE FUNCTION public.import_historical_codes(
  _file_name text,
  _rows jsonb,
  _mode text DEFAULT 'merge'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
<<import_run>>
DECLARE
  batch_id uuid;
  actor jsonb;
  row_item jsonb;
  row_number integer := 0;
  total_rows integer := 0;
  unique_rows integer := 0;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
  duplicate_count integer := 0;
  error_count integer := 0;
  reconciliation_count integer := 0;
  seen_codes text[] := ARRAY[]::text[];
  record_code text;
  normalized text;
  v_record_type text;
  import_mode text := lower(COALESCE(NULLIF(_mode, ''), 'merge'));
  existing public.historical_codes%rowtype;
  merged_id uuid;
  action_taken text;
  rec jsonb;
  previous jsonb;
  new_payload jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can import historical codes';
  END IF;

  IF import_mode NOT IN ('add', 'merge', 'replace') THEN
    RAISE EXCEPTION 'Invalid historical import mode. Use add, merge, or replace.';
  END IF;

  actor := public.actor_snapshot(auth.uid());
  total_rows := jsonb_array_length(COALESCE(_rows, '[]'::jsonb));

  INSERT INTO public.historical_code_import_batches(file_name, imported_by, imported_by_name, total_rows)
  VALUES (_file_name, auth.uid(), actor->>'actor_name', total_rows)
  RETURNING id INTO batch_id;

  FOR row_item IN SELECT value FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb))
  LOOP
    row_number := row_number + 1;
    merged_id := NULL;
    action_taken := NULL;
    v_record_type := lower(COALESCE(NULLIF(row_item->>'record_type', ''), NULLIF(row_item->>'type', ''), 'code'));
    record_code := COALESCE(
      NULLIF(row_item->>'original_code', ''),
      NULLIF(row_item->>'code', ''),
      NULLIF(row_item->>'beneficiary_code', ''),
      NULLIF(row_item->>'policy_number', ''),
      NULLIF(row_item->>'authorization_code', ''),
      NULLIF(row_item->>'claim_number', ''),
      NULLIF(row_item->>'hospital_code', ''),
      NULLIF(row_item->>'payment_reference', '')
    );
    normalized := public.normalize_legacy_code(record_code);

    IF normalized = '' THEN
      error_count := error_count + 1;
      INSERT INTO public.historical_code_import_results(batch_id, row_number, original_code, record_type, action, message, new_values)
      VALUES (batch_id, row_number, record_code, v_record_type, 'Error', 'Missing mandatory code field', row_item);
      CONTINUE;
    END IF;

    IF (v_record_type || ':' || normalized) = ANY(seen_codes) THEN
      duplicate_count := duplicate_count + 1;
      INSERT INTO public.historical_code_import_results(batch_id, row_number, original_code, record_type, action, message, new_values)
      VALUES (batch_id, row_number, record_code, v_record_type, 'Skipped', 'Duplicate code within uploaded file ignored', row_item);
      CONTINUE;
    END IF;

    seen_codes := array_append(seen_codes, v_record_type || ':' || normalized);
    unique_rows := unique_rows + 1;
    rec := public.reconcile_historical_code(row_item || jsonb_build_object('original_code', record_code));
    IF COALESCE((rec->>'matched')::boolean, false) THEN
      reconciliation_count := reconciliation_count + 1;
    END IF;

    SELECT * INTO existing
    FROM public.historical_codes
    WHERE historical_codes.record_type = v_record_type
      AND normalized_code = normalized
    LIMIT 1;

    previous := CASE WHEN existing.id IS NULL THEN '{}'::jsonb ELSE to_jsonb(existing) END;
    new_payload := jsonb_strip_nulls(row_item || jsonb_build_object('source', 'Historical Import', 'import_batch_id', batch_id, 'reconciliation', rec));

    IF existing.id IS NULL THEN
      INSERT INTO public.historical_codes (
        original_code,
        normalized_code,
        record_type,
        beneficiary_code,
        policy_number,
        authorization_code,
        claim_number,
        hospital_code,
        provider_code,
        invoice_number,
        payment_reference,
        patient_name,
        hospital_name,
        date_of_birth,
        legacy_creation_date,
        import_batch_id,
        raw_data,
        reconciliation,
        imported_by
      )
      VALUES (
        record_code,
        normalized,
        v_record_type,
        NULLIF(row_item->>'beneficiary_code', ''),
        NULLIF(row_item->>'policy_number', ''),
        NULLIF(row_item->>'authorization_code', ''),
        NULLIF(row_item->>'claim_number', ''),
        NULLIF(row_item->>'hospital_code', ''),
        NULLIF(row_item->>'provider_code', ''),
        NULLIF(row_item->>'invoice_number', ''),
        NULLIF(row_item->>'payment_reference', ''),
        NULLIF(row_item->>'patient_name', ''),
        NULLIF(row_item->>'hospital_name', ''),
        public.safe_parse_date(row_item->>'date_of_birth'),
        public.safe_parse_date(row_item->>'legacy_creation_date'),
        batch_id,
        row_item,
        rec,
        auth.uid()
      )
      RETURNING id INTO merged_id;

      action_taken := 'Created';
      created_count := created_count + 1;
    ELSIF import_mode = 'add' THEN
      merged_id := existing.id;
      action_taken := 'Skipped';
      skipped_count := skipped_count + 1;
    ELSE
      UPDATE public.historical_codes
      SET
        original_code = CASE WHEN import_mode = 'replace' THEN COALESCE(record_code, original_code) ELSE original_code END,
        beneficiary_code = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'beneficiary_code', ''), beneficiary_code) ELSE COALESCE(beneficiary_code, NULLIF(row_item->>'beneficiary_code', '')) END,
        policy_number = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'policy_number', ''), policy_number) ELSE COALESCE(policy_number, NULLIF(row_item->>'policy_number', '')) END,
        authorization_code = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'authorization_code', ''), authorization_code) ELSE COALESCE(authorization_code, NULLIF(row_item->>'authorization_code', '')) END,
        claim_number = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'claim_number', ''), claim_number) ELSE COALESCE(claim_number, NULLIF(row_item->>'claim_number', '')) END,
        hospital_code = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'hospital_code', ''), hospital_code) ELSE COALESCE(hospital_code, NULLIF(row_item->>'hospital_code', '')) END,
        provider_code = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'provider_code', ''), provider_code) ELSE COALESCE(provider_code, NULLIF(row_item->>'provider_code', '')) END,
        invoice_number = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'invoice_number', ''), invoice_number) ELSE COALESCE(invoice_number, NULLIF(row_item->>'invoice_number', '')) END,
        payment_reference = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'payment_reference', ''), payment_reference) ELSE COALESCE(payment_reference, NULLIF(row_item->>'payment_reference', '')) END,
        patient_name = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'patient_name', ''), patient_name) ELSE COALESCE(patient_name, NULLIF(row_item->>'patient_name', '')) END,
        hospital_name = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'hospital_name', ''), hospital_name) ELSE COALESCE(hospital_name, NULLIF(row_item->>'hospital_name', '')) END,
        date_of_birth = CASE WHEN import_mode = 'replace' THEN COALESCE(public.safe_parse_date(row_item->>'date_of_birth'), date_of_birth) ELSE COALESCE(date_of_birth, public.safe_parse_date(row_item->>'date_of_birth')) END,
        legacy_creation_date = CASE WHEN import_mode = 'replace' THEN COALESCE(public.safe_parse_date(row_item->>'legacy_creation_date'), legacy_creation_date) ELSE COALESCE(legacy_creation_date, public.safe_parse_date(row_item->>'legacy_creation_date')) END,
        import_batch_id = batch_id,
        raw_data = raw_data || row_item,
        reconciliation = reconciliation || rec,
        synchronized = true,
        last_synchronized_at = now(),
        updated_at = now()
      WHERE id = existing.id
        AND (
          (
            import_mode = 'merge'
            AND (
              (beneficiary_code IS NULL AND NULLIF(row_item->>'beneficiary_code', '') IS NOT NULL)
              OR (policy_number IS NULL AND NULLIF(row_item->>'policy_number', '') IS NOT NULL)
              OR (authorization_code IS NULL AND NULLIF(row_item->>'authorization_code', '') IS NOT NULL)
              OR (claim_number IS NULL AND NULLIF(row_item->>'claim_number', '') IS NOT NULL)
              OR (hospital_code IS NULL AND NULLIF(row_item->>'hospital_code', '') IS NOT NULL)
              OR (provider_code IS NULL AND NULLIF(row_item->>'provider_code', '') IS NOT NULL)
              OR (invoice_number IS NULL AND NULLIF(row_item->>'invoice_number', '') IS NOT NULL)
              OR (payment_reference IS NULL AND NULLIF(row_item->>'payment_reference', '') IS NOT NULL)
              OR (patient_name IS NULL AND NULLIF(row_item->>'patient_name', '') IS NOT NULL)
              OR (hospital_name IS NULL AND NULLIF(row_item->>'hospital_name', '') IS NOT NULL)
              OR (date_of_birth IS NULL AND public.safe_parse_date(row_item->>'date_of_birth') IS NOT NULL)
              OR (legacy_creation_date IS NULL AND public.safe_parse_date(row_item->>'legacy_creation_date') IS NOT NULL)
              OR (COALESCE(reconciliation->>'matched', 'false') = 'false' AND COALESCE(rec->>'matched', 'false') = 'true')
            )
          ) OR import_mode = 'replace'
        )
      RETURNING id INTO merged_id;

      IF merged_id IS NULL THEN
        merged_id := existing.id;
      END IF;

      SELECT * INTO existing FROM public.historical_codes WHERE id = merged_id;
      IF previous IS DISTINCT FROM to_jsonb(existing) THEN
        action_taken := 'Updated';
        updated_count := updated_count + 1;
      ELSE
        action_taken := 'Skipped';
        skipped_count := skipped_count + 1;
      END IF;
    END IF;

    INSERT INTO public.historical_code_import_results(
      batch_id,
      row_number,
      original_code,
      record_type,
      action,
      message,
      historical_code_id,
      previous_values,
      new_values
    )
    VALUES (
      batch_id,
      row_number,
      record_code,
      v_record_type,
      action_taken,
      CASE action_taken WHEN 'Skipped' THEN 'Already exists with no blank fields to merge' ELSE action_taken || ' by historical import' END,
      merged_id,
      previous,
      new_payload
    );

    -- Sync historical authorizations into the main authorization_requests table for Admin/Nurse visibility
    IF v_record_type != 'claim' THEN
      IF NOT EXISTS (SELECT 1 FROM public.authorization_requests WHERE authorization_code = record_code) THEN
        INSERT INTO public.authorization_requests (
          patient_name,
          policy_number,
          diagnosis,
          treatment,
          hospital_name,
          authorization_code,
          status,
          is_historical,
          created_at,
          updated_at
        ) VALUES (
          COALESCE(NULLIF(row_item->>'patient_name', ''), 'Historical Patient'),
          COALESCE(NULLIF(row_item->>'policy_number', ''), 'HISTORICAL-POLICY'),
          COALESCE(NULLIF(row_item->>'diagnosis', ''), 'Historical Record'),
          COALESCE(NULLIF(row_item->>'treatment', ''), 'Historical Record'),
          NULLIF(row_item->>'hospital_name', ''),
          record_code,
          'approved',
          true,
          COALESCE(public.safe_parse_date(row_item->>'legacy_creation_date'), now()),
          now()
        );
      ELSE
        -- If mode is replace or merge, update missing diagnosis and treatment
        IF import_mode IN ('merge', 'replace') THEN
          UPDATE public.authorization_requests
          SET 
            diagnosis = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'diagnosis', ''), diagnosis) ELSE COALESCE(NULLIF(diagnosis, 'Historical Record'), NULLIF(row_item->>'diagnosis', ''), 'Historical Record') END,
            treatment = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'treatment', ''), treatment) ELSE COALESCE(NULLIF(treatment, 'Historical Record'), NULLIF(row_item->>'treatment', ''), 'Historical Record') END,
            patient_name = CASE WHEN import_mode = 'replace' THEN COALESCE(NULLIF(row_item->>'patient_name', ''), patient_name) ELSE COALESCE(NULLIF(patient_name, 'Historical Patient'), NULLIF(row_item->>'patient_name', ''), 'Historical Patient') END
          WHERE authorization_code = record_code AND is_historical = true;
        END IF;
      END IF;
    END IF;

  END LOOP;

  UPDATE public.historical_code_import_batches
  SET status = 'completed',
      unique_rows = import_run.unique_rows,
      created_count = import_run.created_count,
      updated_count = import_run.updated_count,
      skipped_count = import_run.skipped_count,
      duplicate_count = import_run.duplicate_count,
      error_count = import_run.error_count,
      reconciliation_count = import_run.reconciliation_count,
      validation_results = jsonb_build_object(
        'duplicates_in_file', import_run.duplicate_count,
        'errors', import_run.error_count,
        'reconciliation_matches', import_run.reconciliation_count
      ),
      completed_at = now()
  WHERE id = batch_id;

  PERFORM public.write_audit_log(
    'HISTORICAL_CODE_IMPORT_COMPLETED',
    'historical_import_batch',
    batch_id::text,
    '{}'::jsonb,
    jsonb_build_object(
      'file_name', _file_name,
      'total_rows', total_rows,
      'unique_rows', unique_rows,
      'created_count', created_count,
      'updated_count', updated_count,
      'skipped_count', skipped_count,
      'duplicate_count', duplicate_count,
      'error_count', error_count,
      'reconciliation_count', reconciliation_count
    ),
    'Historical code import and reconciliation',
    CASE WHEN error_count > 0 THEN 'warning' ELSE 'info' END,
    jsonb_build_object('batch_id', batch_id)
  );

  RETURN jsonb_build_object(
    'batch_id', batch_id,
    'total_rows', total_rows,
    'unique_rows', unique_rows,
    'created_count', created_count,
    'updated_count', updated_count,
    'skipped_count', skipped_count,
    'duplicate_count', duplicate_count,
    'error_count', error_count,
    'reconciliation_count', reconciliation_count
  );
END;

$$;

-- Run a one-time sync to push all existing historical_codes into authorization_requests
-- For any historical code that hasn't been synced yet
INSERT INTO public.authorization_requests (
  patient_name,
  policy_number,
  diagnosis,
  treatment,
  hospital_name,
  authorization_code,
  status,
  is_historical,
  created_at,
  updated_at
)
SELECT 
  COALESCE(NULLIF(raw_data->>'patient_name', ''), 'Historical Patient'),
  COALESCE(NULLIF(raw_data->>'policy_number', ''), 'HISTORICAL-POLICY'),
  COALESCE(NULLIF(raw_data->>'diagnosis', ''), 'Historical Record'),
  COALESCE(NULLIF(raw_data->>'treatment', ''), 'Historical Record'),
  NULLIF(raw_data->>'hospital_name', ''),
  original_code,
  'approved',
  true,
  COALESCE(public.safe_parse_date(raw_data->>'legacy_creation_date'), now()),
  now()
FROM public.historical_codes
WHERE record_type != 'claim'
  AND NOT EXISTS (
    SELECT 1 FROM public.authorization_requests WHERE authorization_code = public.historical_codes.original_code
  );

-- Update existing ones if they have 'Historical Record' but the historical_codes table has the actual data
UPDATE public.authorization_requests a
SET 
  diagnosis = COALESCE(NULLIF(h.raw_data->>'diagnosis', ''), a.diagnosis),
  treatment = COALESCE(NULLIF(h.raw_data->>'treatment', ''), a.treatment),
  patient_name = COALESCE(NULLIF(h.raw_data->>'patient_name', ''), a.patient_name)
FROM public.historical_codes h
WHERE a.authorization_code = h.original_code 
  AND a.is_historical = true
  AND (a.diagnosis = 'Historical Record' OR a.treatment = 'Historical Record');

COMMIT;
