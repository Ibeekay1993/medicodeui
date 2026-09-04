-- WhatsApp security hardening
--
-- Security model:
--   1. WhatsApp sender must resolve to an ACTIVE hospital user in user_roles.
--   2. Patient name + policy number must match the SAME live NHIS beneficiary.
--   3. Hospital identity is derived from the sender phone, never from free text or AI.
--   4. WhatsApp-created authorization rows are protected by a BEFORE INSERT trigger,
--      so the worker's direct-DB fallback cannot bypass the checks.
--   5. Approval/rejection notifications use authorization_requests.patient_phone,
--      never the hospital sender's phone.

CREATE OR REPLACE FUNCTION public.normalize_whatsapp_phone(_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  digits text;
BEGIN
  digits := regexp_replace(_phone, '[^0-9]', '', 'g');
  IF digits LIKE '00%' THEN
    digits := substr(digits, 3);
  END IF;
  IF digits LIKE '0%' AND length(digits) = 11 THEN
    digits := '234' || substr(digits, 2);
  END IF;
  RETURN digits;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_whatsapp_hospital_contact(_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  normalized text;
  contact_count integer;
  hospital_count integer;
  resolved_hospital uuid;
  contact_name text;
  contact_role text;
BEGIN
  normalized := public.normalize_whatsapp_phone(coalesce(_phone, ''));
  IF normalized = '' THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'phone_required');
  END IF;

  SELECT count(*) INTO contact_count
  FROM public.user_roles ur
  WHERE lower(coalesce(ur.role::text, '')) = 'hospital'
    AND lower(coalesce(ur.access_status::text, '')) = 'active'
    AND ur.hospital_id IS NOT NULL
    AND public.normalize_whatsapp_phone(coalesce(ur.phone, '')) = normalized;

  SELECT count(DISTINCT ur.hospital_id) INTO hospital_count
  FROM public.user_roles ur
  WHERE lower(coalesce(ur.role::text, '')) = 'hospital'
    AND lower(coalesce(ur.access_status::text, '')) = 'active'
    AND ur.hospital_id IS NOT NULL
    AND public.normalize_whatsapp_phone(coalesce(ur.phone, '')) = normalized;

  IF contact_count = 0 THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'unregistered_sender');
  END IF;

  IF hospital_count <> 1 THEN
    RETURN jsonb_build_object('authorized', false, 'reason', 'ambiguous_sender');
  END IF;

  SELECT ur.hospital_id, ur.full_name, ur.role::text
  INTO resolved_hospital, contact_name, contact_role
  FROM public.user_roles ur
  WHERE lower(coalesce(ur.role::text, '')) = 'hospital'
    AND lower(coalesce(ur.access_status::text, '')) = 'active'
    AND ur.hospital_id IS NOT NULL
    AND public.normalize_whatsapp_phone(coalesce(ur.phone, '')) = normalized
  ORDER BY ur.updated_at DESC NULLS LAST, ur.created_at DESC NULLS LAST
  LIMIT 1;

  RETURN jsonb_build_object(
    'authorized', true,
    'hospital_id', resolved_hospital,
    'contact_name', contact_name,
    'role', contact_role,
    'phone', normalized
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_whatsapp_authorization_context(
  _message_id text,
  _patient_name text,
  _policy_number text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sender_phone text;
  hospital_context jsonb;
  hospital_id uuid;
  normalized_name text;
  normalized_policy text;
  beneficiary_count integer;
  beneficiary_id uuid;
  canonical_name text;
  canonical_policy text;
  patient_phone text;
BEGIN
  SELECT wm.phone_number
  INTO sender_phone
  FROM public.whatsapp_messages wm
  WHERE wm.message_id = _message_id
  LIMIT 1;

  IF coalesce(sender_phone, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'whatsapp_message_not_found');
  END IF;

  hospital_context := public.resolve_whatsapp_hospital_contact(sender_phone);
  IF coalesce((hospital_context->>'authorized')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', hospital_context->>'reason'
    );
  END IF;

  hospital_id := (hospital_context->>'hospital_id')::uuid;
  normalized_name := regexp_replace(lower(trim(coalesce(_patient_name, ''))), '\s+', ' ', 'g');
  normalized_policy := upper(trim(coalesce(_policy_number, '')));

  IF normalized_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'patient_name_required');
  END IF;
  IF normalized_policy = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'policy_number_required');
  END IF;

  SELECT count(*) INTO beneficiary_count
  FROM public.nhis_beneficiaries nb
  WHERE upper(trim(coalesce(nb.policy_number, ''))) = normalized_policy
    AND regexp_replace(lower(trim(coalesce(nb.full_name, ''))), '\s+', ' ', 'g') = normalized_name;

  IF beneficiary_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_mismatch');
  END IF;

  IF beneficiary_count > 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_ambiguous');
  END IF;

  SELECT nb.id, nb.full_name, nb.policy_number
  INTO beneficiary_id, canonical_name, canonical_policy
  FROM public.nhis_beneficiaries nb
  WHERE upper(trim(coalesce(nb.policy_number, ''))) = normalized_policy
    AND regexp_replace(lower(trim(coalesce(nb.full_name, ''))), '\s+', ' ', 'g') = normalized_name
  LIMIT 1;

  -- Patient phone is intentionally NOT sourced from the hospital sender.
  -- The WhatsApp worker supplies the patient's phone separately when captured.
  RETURN jsonb_build_object(
    'ok', true,
    'hospital_id', hospital_id,
    'hospital_contact_id', hospital_context->>'contact_name',
    'sender_phone', public.normalize_whatsapp_phone(sender_phone),
    'beneficiary_id', beneficiary_id,
    'patient_name', canonical_name,
    'policy_number', canonical_policy
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_whatsapp_authorization_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  context jsonb;
  sender_phone text;
  patient_name_value text;
  policy_value text;
  hospital_id_value uuid;
  resolved_hospital uuid;
BEGIN
  IF lower(coalesce(NEW.source, '')) <> 'whatsapp' THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.whatsapp_raw_message, '') = '' THEN
    RAISE EXCEPTION 'WhatsApp authorization requires a source message id';
  END IF;

  context := public.resolve_whatsapp_authorization_context(
    NEW.whatsapp_raw_message,
    NEW.patient_name,
    NEW.policy_number
  );

  IF coalesce((context->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'WhatsApp authorization rejected: %', coalesce(context->>'reason', 'security_validation_failed');
  END IF;

  resolved_hospital := (context->>'hospital_id')::uuid;
  hospital_id_value := NEW.hospital_id;

  IF hospital_id_value IS NOT NULL AND hospital_id_value <> resolved_hospital THEN
    RAISE EXCEPTION 'WhatsApp authorization hospital does not match authenticated sender';
  END IF;
  IF NEW.requesting_hospital_id IS NOT NULL AND NEW.requesting_hospital_id <> resolved_hospital THEN
    RAISE EXCEPTION 'WhatsApp requesting hospital does not match authenticated sender';
  END IF;

  NEW.hospital_id := resolved_hospital;
  NEW.requesting_hospital_id := resolved_hospital;

  SELECT h.name INTO NEW.hospital_name
  FROM public.hospitals h
  WHERE h.id = resolved_hospital;

  NEW.requesting_hospital_name := NEW.hospital_name;
  NEW.referring_hospital_id := resolved_hospital;
  NEW.referring_hospital_name := NEW.hospital_name;

  -- The trigger canonicalizes the beneficiary identity from the live NHIS table.
  NEW.patient_name := context->>'patient_name';
  NEW.policy_number := context->>'policy_number';

  -- Never let a WhatsApp hospital sender become the patient's notification number.
  sender_phone := context->>'sender_phone';
  IF coalesce(NEW.patient_phone, '') <> ''
     AND public.normalize_whatsapp_phone(NEW.patient_phone) = sender_phone THEN
    RAISE EXCEPTION 'WhatsApp authorization requires the patient phone, not the hospital sender phone';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_whatsapp_authorization_security
ON public.authorization_requests;

CREATE TRIGGER trg_enforce_whatsapp_authorization_security
BEFORE INSERT ON public.authorization_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_whatsapp_authorization_security();

-- Approval/rejection notifications must target the patient, not the hospital
-- WhatsApp sender. The previous trigger selected the first inbound message phone.
CREATE OR REPLACE FUNCTION public.fn_enqueue_whatsapp_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status)
     AND (NEW.status IN ('approved', 'rejected')) THEN
    IF coalesce(trim(NEW.patient_phone), '') = '' THEN
      RAISE WARNING 'WhatsApp notification not enqueued for request %: patient phone is missing', NEW.id;
      RETURN NEW;
    END IF;

    INSERT INTO public.whatsapp_notifications (
      authorization_request_id,
      phone_number,
      notification_type,
      status
    )
    VALUES (
      NEW.id,
      NEW.patient_phone,
      CASE WHEN NEW.status = 'approved' THEN 'APPROVAL' ELSE 'REJECTION' END,
      'pending'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Keep the existing trigger but make sure it points at the hardened function.
DROP TRIGGER IF EXISTS trg_whatsapp_notification_enqueue
ON public.authorization_requests;

CREATE TRIGGER trg_whatsapp_notification_enqueue
AFTER UPDATE ON public.authorization_requests
FOR EACH ROW
EXECUTE FUNCTION public.fn_enqueue_whatsapp_notification();
