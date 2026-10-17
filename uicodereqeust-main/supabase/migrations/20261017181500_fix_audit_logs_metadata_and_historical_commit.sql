-- Migration: 20261017181500_fix_audit_logs_metadata_and_historical_commit.sql
-- Description:
-- 1. Ensure `metadata` column exists on public.audit_logs so any query or insert targeting metadata does not fail.
-- 2. Update `rpc_commit_historical_authorisations_chunk` to write payload info to standard `details` as well as `metadata`.

BEGIN;

-- 1. Ensure metadata column exists on audit_logs for backward compatibility
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Update rpc_commit_historical_authorisations_chunk
CREATE OR REPLACE FUNCTION public.rpc_commit_historical_authorisations_chunk(
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := auth.uid();
  rec JSONB;
  inserted_count INT := 0;
  updated_count INT := 0;
  skipped_count INT := 0;
  v_auth_code TEXT;
  v_request_id TEXT;
  v_target_id UUID;
  v_status TEXT;
  v_items JSONB;
  v_total NUMERIC;
  v_hosp_id UUID;
  v_req_hosp_id UUID;
  v_ref_hosp_id UUID;
  v_claim_hosp_id UUID;
BEGIN
  IF NOT public.has_role(actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only administrators can commit historical authorisations';
  END IF;

  FOR rec IN SELECT value FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    v_auth_code := NULLIF(trim(rec->>'authorization_code'), '');
    v_request_id := NULLIF(trim(rec->>'request_id'), '');
    v_status := lower(trim(COALESCE(rec->>'status', 'approved')));
    v_items := COALESCE(rec->'approved_items', '[]'::jsonb);
    v_total := COALESCE((rec->>'total_amount')::numeric, 0.00);

    -- Safe UUID parsing and fallback resolution
    v_hosp_id := NULL;
    IF rec->>'hospital_id' IS NOT NULL AND rec->>'hospital_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_hosp_id := (rec->>'hospital_id')::uuid;
    END IF;
    IF v_hosp_id IS NULL THEN
      SELECT id INTO v_hosp_id FROM public.hospitals 
      WHERE code = 'OY/0252/P' OR name ILIKE '%jaja%' OR name ILIKE '%university health%' 
      LIMIT 1;
    END IF;

    v_req_hosp_id := COALESCE(
      CASE WHEN rec->>'requesting_hospital_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
           THEN (rec->>'requesting_hospital_id')::uuid ELSE NULL END,
      v_hosp_id
    );

    v_ref_hosp_id := NULL;
    IF rec->>'referred_hospital_id' IS NOT NULL AND rec->>'referred_hospital_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_ref_hosp_id := (rec->>'referred_hospital_id')::uuid;
    ELSIF rec->>'referred_hospital_name' ILIKE '%uch%' OR rec->>'referred_hospital_name' ILIKE '%college hospital%' OR rec->>'hospital_name' ILIKE '%college hospital%' THEN
      SELECT id INTO v_ref_hosp_id FROM public.hospitals WHERE code = 'OY/0001/P' OR name ILIKE '%university college hospital%' LIMIT 1;
    ELSIF rec->>'referred_hospital_name' ILIKE '%police%' OR rec->>'hospital_name' ILIKE '%police%' THEN
      SELECT id INTO v_ref_hosp_id FROM public.hospitals WHERE code = 'OY/0231/P' OR name ILIKE '%police clinic%' LIMIT 1;
    END IF;

    v_claim_hosp_id := COALESCE(v_ref_hosp_id, v_hosp_id);

    -- Find existing authorization by code if code exists
    IF v_auth_code IS NOT NULL THEN
      SELECT id INTO v_target_id
      FROM public.authorization_requests
      WHERE authorization_code = v_auth_code
      LIMIT 1;
    ELSIF v_request_id IS NOT NULL THEN
      SELECT id INTO v_target_id
      FROM public.authorization_requests
      WHERE request_id = v_request_id
      LIMIT 1;
    ELSE
      v_target_id := NULL;
    END IF;

    IF v_target_id IS NOT NULL THEN
      -- Update existing record cleanly
      UPDATE public.authorization_requests
      SET
        patient_name = COALESCE(NULLIF(rec->>'patient_name', ''), patient_name),
        policy_number = COALESCE(NULLIF(rec->>'policy_number', ''), policy_number),
        diagnosis = COALESCE(NULLIF(rec->>'diagnosis', ''), diagnosis),
        treatment = COALESCE(NULLIF(rec->>'treatment', ''), treatment),
        hospital_id = COALESCE(v_hosp_id, hospital_id),
        hospital_name = COALESCE(NULLIF(rec->>'hospital_name', ''), hospital_name),
        requesting_hospital_id = COALESCE(v_req_hosp_id, requesting_hospital_id),
        requesting_hospital_name = COALESCE(NULLIF(rec->>'requesting_hospital_name', ''), requesting_hospital_name),
        referred_hospital_id = COALESCE(v_ref_hosp_id, referred_hospital_id),
        referred_hospital_name = COALESCE(NULLIF(rec->>'referred_hospital_name', ''), referred_hospital_name),
        claiming_hospital_id = COALESCE(v_claim_hosp_id, claiming_hospital_id),
        claiming_hospital_name = COALESCE(NULLIF(rec->>'claiming_hospital_name', ''), claiming_hospital_name),
        status = v_status,
        total_amount = v_total,
        approved_items = v_items,
        decided_at = COALESCE((rec->>'decided_at')::timestamptz, decided_at),
        authorized_by_name = COALESCE(NULLIF(rec->>'authorized_by_name', ''), authorized_by_name),
        is_historical = TRUE,
        source = 'historical_import',
        updated_at = now()
      WHERE id = v_target_id;
      updated_count := updated_count + 1;
    ELSE
      -- Insert new historical authorization
      -- Note: generate a safe canonical request_id if none provided
      IF v_request_id IS NULL THEN
        IF v_auth_code IS NOT NULL THEN
          v_request_id := 'REQ-HIST-' || regexp_replace(v_auth_code, '[^0-9A-Za-z]', '', 'g');
        ELSE
          v_request_id := 'REQ-HIST-' || substr(gen_random_uuid()::text, 1, 8);
        END IF;
      END IF;

      INSERT INTO public.authorization_requests (
        request_id,
        authorization_code,
        patient_name,
        policy_number,
        diagnosis,
        treatment,
        hospital_id,
        hospital_name,
        requesting_hospital_id,
        requesting_hospital_name,
        referred_hospital_id,
        referred_hospital_name,
        claiming_hospital_id,
        claiming_hospital_name,
        status,
        source,
        is_historical,
        approved_items,
        total_amount,
        decided_at,
        authorized_by_name,
        submitted_by,
        decided_by,
        created_at,
        updated_at
      )
      VALUES (
        v_request_id,
        v_auth_code,
        COALESCE(NULLIF(rec->>'patient_name', ''), 'Unknown Patient'),
        COALESCE(NULLIF(rec->>'policy_number', ''), 'UNKNOWN'),
        COALESCE(NULLIF(rec->>'diagnosis', ''), 'No diagnosis'),
        COALESCE(NULLIF(rec->>'treatment', ''), 'No treatment details'),
        v_hosp_id,
        rec->>'hospital_name',
        v_req_hosp_id,
        rec->>'requesting_hospital_name',
        v_ref_hosp_id,
        rec->>'referred_hospital_name',
        v_claim_hosp_id,
        rec->>'claiming_hospital_name',
        v_status,
        'historical_import',
        TRUE,
        v_items,
        v_total,
        COALESCE((rec->>'decided_at')::timestamptz, now()),
        COALESCE(NULLIF(rec->>'authorized_by_name', ''), 'Authorizing Officer (AO)'),
        actor_id,
        actor_id,
        COALESCE((rec->>'decided_at')::timestamptz, now()),
        now()
      );
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  -- Create audit log entry with details and metadata
  INSERT INTO public.audit_logs (
    action,
    entity_type,
    user_id,
    details,
    metadata
  )
  VALUES (
    'HISTORICAL_AUTHORISATIONS_COMMITTED',
    'authorization_requests',
    actor_id,
    jsonb_build_object(
      'inserted_count', inserted_count,
      'updated_count', updated_count,
      'skipped_count', skipped_count,
      'chunk_size', jsonb_array_length(COALESCE(p_rows, '[]'::jsonb))
    ),
    jsonb_build_object(
      'inserted_count', inserted_count,
      'updated_count', updated_count,
      'skipped_count', skipped_count,
      'chunk_size', jsonb_array_length(COALESCE(p_rows, '[]'::jsonb))
    )
  );

  RETURN jsonb_build_object(
    'inserted_count', inserted_count,
    'updated_count', updated_count,
    'skipped_count', skipped_count,
    'success', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_commit_historical_authorisations_chunk(JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_commit_historical_authorisations_chunk(JSONB)
  TO authenticated;

COMMIT;
