
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

  actor := public.actor_snapshot(auth.uid());
  total_rows := jsonb_array_length(COALESCE(_rows, '[]'::jsonb));

  INSERT INTO public.historical_code_import_batches(file_name, imported_by, imported_by_name, total_rows)
  VALUES (_file_name, auth.uid(), actor->>'actor_name', total_rows)
  RETURNING id INTO batch_id;

  FOR row_item IN SELECT value FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb))
  LOOP
    row_number := row_number + 1;
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
    ON CONFLICT (record_type, normalized_code) DO UPDATE SET
      beneficiary_code = COALESCE(public.historical_codes.beneficiary_code, EXCLUDED.beneficiary_code),
      policy_number = COALESCE(public.historical_codes.policy_number, EXCLUDED.policy_number),
      authorization_code = COALESCE(public.historical_codes.authorization_code, EXCLUDED.authorization_code),
      claim_number = COALESCE(public.historical_codes.claim_number, EXCLUDED.claim_number),
      hospital_code = COALESCE(public.historical_codes.hospital_code, EXCLUDED.hospital_code),
      provider_code = COALESCE(public.historical_codes.provider_code, EXCLUDED.provider_code),
      invoice_number = COALESCE(public.historical_codes.invoice_number, EXCLUDED.invoice_number),
      payment_reference = COALESCE(public.historical_codes.payment_reference, EXCLUDED.payment_reference),
      patient_name = COALESCE(public.historical_codes.patient_name, EXCLUDED.patient_name),
      hospital_name = COALESCE(public.historical_codes.hospital_name, EXCLUDED.hospital_name),
      date_of_birth = COALESCE(public.historical_codes.date_of_birth, EXCLUDED.date_of_birth),
      legacy_creation_date = COALESCE(public.historical_codes.legacy_creation_date, EXCLUDED.legacy_creation_date),
      raw_data = public.historical_codes.raw_data || EXCLUDED.raw_data,
      reconciliation = public.historical_codes.reconciliation || EXCLUDED.reconciliation,
      synchronized = true,
      last_synchronized_at = now(),
      updated_at = now()
    WHERE (public.historical_codes.beneficiary_code IS NULL AND EXCLUDED.beneficiary_code IS NOT NULL)
       OR (public.historical_codes.policy_number IS NULL AND EXCLUDED.policy_number IS NOT NULL)
       OR (public.historical_codes.authorization_code IS NULL AND EXCLUDED.authorization_code IS NOT NULL)
       OR (public.historical_codes.claim_number IS NULL AND EXCLUDED.claim_number IS NOT NULL)
       OR (public.historical_codes.hospital_code IS NULL AND EXCLUDED.hospital_code IS NOT NULL)
       OR (public.historical_codes.provider_code IS NULL AND EXCLUDED.provider_code IS NOT NULL)
       OR (public.historical_codes.invoice_number IS NULL AND EXCLUDED.invoice_number IS NOT NULL)
       OR (public.historical_codes.payment_reference IS NULL AND EXCLUDED.payment_reference IS NOT NULL)
       OR (public.historical_codes.patient_name IS NULL AND EXCLUDED.patient_name IS NOT NULL)
       OR (public.historical_codes.hospital_name IS NULL AND EXCLUDED.hospital_name IS NOT NULL)
       OR (public.historical_codes.date_of_birth IS NULL AND EXCLUDED.date_of_birth IS NOT NULL)
       OR (public.historical_codes.legacy_creation_date IS NULL AND EXCLUDED.legacy_creation_date IS NOT NULL)
       OR (COALESCE(public.historical_codes.reconciliation->>'matched', 'false') = 'false' AND COALESCE(EXCLUDED.reconciliation->>'matched', 'false') = 'true')
    RETURNING id INTO merged_id;

    IF existing.id IS NULL THEN
      action_taken := 'Created';
      created_count := created_count + 1;
    ELSE
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
