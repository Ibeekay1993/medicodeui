BEGIN;

-- 1. Update derive_authorization_request_provenance to permit historical imports by authorized admins
CREATE OR REPLACE FUNCTION public.derive_authorization_request_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_role text := auth.role();
BEGIN
  IF actor_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authorization requests require a trusted intake path';
  END IF;

  -- Allow administrative historical imports
  IF public.has_role(actor_id, 'admin'::public.app_role)
     AND lower(btrim(coalesce(NEW.source, ''))) = 'historical_import' THEN
    NEW.source := 'historical_import';
    NEW.submitted_by := coalesce(NEW.submitted_by, actor_id);
    NEW.is_historical := TRUE;
    NEW.whatsapp_message_id := NULL;
    NEW.whatsapp_raw_message := NULL;
    RETURN NEW;
  END IF;

  IF public.has_role(actor_id, 'hospital'::public.app_role)
     AND NEW.hospital_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = actor_id
         AND ur.role = 'hospital'::public.app_role
         AND ur.hospital_id = NEW.hospital_id
     ) THEN
    -- Derive the portal origin from the authenticated hospital identity.
    NEW.source := 'hospital_portal';
    NEW.submitted_by := actor_id;
    NEW.whatsapp_message_id := NULL;
    NEW.whatsapp_raw_message := NULL;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Authorization requests must use the authenticated intake path';
END;
$$;

REVOKE ALL ON FUNCTION public.derive_authorization_request_provenance()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.derive_authorization_request_provenance()
  TO authenticated, service_role;

-- 2. Suppress WhatsApp notifications for historical imports
CREATE OR REPLACE FUNCTION public.fn_enqueue_whatsapp_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  decision_type text;
  hospital_phone text;
BEGIN
  -- Completely bypass historical records from sending WhatsApp alerts
  IF lower(coalesce(NEW.source, '')) = 'historical_import'
     OR NEW.is_historical IS TRUE THEN
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('approved', 'partially_approved', 'rejected', 'referral_approved')
     AND NEW.decided_at IS NOT NULL
     AND NEW.decided_by IS NOT NULL
     AND (
       NEW.status = 'rejected'
       OR (
         NEW.approved_by IS NOT NULL
         AND COALESCE(NULLIF(BTRIM(NEW.authorization_code), ''), '') <> ''
       )
     ) THEN
    decision_type := CASE
      WHEN NEW.status = 'partially_approved' THEN 'PARTIAL_APPROVAL'
      WHEN NEW.status = 'rejected' THEN 'REJECTION'
      ELSE 'APPROVAL'
    END;

    SELECT COALESCE(
      (
        SELECT wm.phone_number
        FROM public.whatsapp_messages AS wm
        WHERE wm.authorization_request_id = NEW.id
        ORDER BY wm.received_at ASC
        LIMIT 1
      ),
      (
        SELECT h.whatsapp_number
        FROM public.hospitals AS h
        WHERE h.id = COALESCE(NEW.claiming_hospital_id, NEW.referred_hospital_id, NEW.hospital_id)
      )
    ) INTO hospital_phone;

    IF hospital_phone IS NOT NULL AND BTRIM(hospital_phone) <> '' THEN
      INSERT INTO public.whatsapp_notifications (
        authorization_request_id,
        notification_type,
        recipient_type,
        decision_at,
        payload,
        status,
        attempts
      )
      VALUES (
        NEW.id,
        decision_type,
        'hospital',
        NEW.decided_at,
        jsonb_build_object(
          'recipient_type', 'hospital',
          'recipient_phone', hospital_phone,
          'authorization_code', NEW.authorization_code,
          'patient_name', NEW.patient_name,
          'status', NEW.status,
          'diagnosis', NEW.diagnosis,
          'treatment', NEW.treatment,
          'decided_at', NEW.decided_at,
          'decision_reason', NEW.decision_reason
        ),
        'queued_v2',
        0
      )
      ON CONFLICT (authorization_request_id, notification_type, recipient_type, decision_at)
        WHERE decision_at IS NOT NULL
        DO UPDATE SET
          payload = EXCLUDED.payload,
          status = CASE
            WHEN public.whatsapp_notifications.status IN ('sent', 'delivered', 'read') THEN public.whatsapp_notifications.status
            ELSE 'queued_v2'
          END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Staging table for historical authorisation imports
CREATE TABLE IF NOT EXISTS public.historical_authorisation_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID,
  file_name TEXT,
  row_number INT NOT NULL,
  authorization_code TEXT,
  request_id TEXT,
  patient_name TEXT,
  policy_number TEXT,
  hospital_name TEXT,
  hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  requesting_hospital_name TEXT,
  requesting_hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  referred_hospital_name TEXT,
  referred_hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  claiming_hospital_name TEXT,
  claiming_hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  diagnosis TEXT,
  treatment TEXT,
  raw_status TEXT,
  status TEXT NOT NULL DEFAULT 'approved',
  decided_at TIMESTAMPTZ,
  approved_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  authorized_by_name TEXT,
  reconciliation_status TEXT NOT NULL DEFAULT 'pending_review',
  review_notes TEXT,
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.historical_authorisation_staging ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage historical staging" ON public.historical_authorisation_staging;
CREATE POLICY "Admins manage historical staging" ON public.historical_authorisation_staging
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_hist_stage_batch ON public.historical_authorisation_staging(batch_id);
CREATE INDEX IF NOT EXISTS idx_hist_stage_auth ON public.historical_authorisation_staging(authorization_code);

-- 4. Index on authorization_requests.authorization_code for fast conflict detection
CREATE INDEX IF NOT EXISTS idx_auth_requests_auth_code ON public.authorization_requests(authorization_code);
CREATE INDEX IF NOT EXISTS idx_auth_requests_is_historical ON public.authorization_requests(is_historical);

-- 5. Atomic RPC function to commit historical authorisations in chunks
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

  -- Create audit log entry
  INSERT INTO public.audit_logs (
    action,
    entity_type,
    user_id,
    details
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
