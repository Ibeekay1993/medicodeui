BEGIN;

-- Keep the NHIS member identifier on a request independently from the family
-- policy number. Existing requests remain valid and resolve through name/policy.
ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS beneficiary_number text;

CREATE INDEX IF NOT EXISTS idx_authorization_requests_beneficiary_number
  ON public.authorization_requests (beneficiary_number)
  WHERE beneficiary_number IS NOT NULL;

-- Match beneficiary names independent of token order (e.g. "Afolayan Ibukun"
-- and "Ibukun Afolayan") while retaining ambiguity checks across family rows.
CREATE OR REPLACE FUNCTION public.normalize_whatsapp_identity_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(string_agg(token, ' ' ORDER BY token), '')
  FROM regexp_split_to_table(
    regexp_replace(lower(trim(coalesce(_name, ''))), '[^[:alnum:]]+', ' ', 'g'),
    '\s+'
  ) AS t(token)
  WHERE token <> '';
$$;

-- The submitted suffix now verifies the specific beneficiary when the current
-- NHIS import contains member numbers. Base family numbers remain supported;
-- they resolve only when the exact normalized name identifies one member.
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
  base_policy text;
  member_suffix text;
  is_family_policy boolean;
  beneficiary_count integer := 0;
  beneficiary_id uuid;
  canonical_name text;
  canonical_policy text;
  canonical_beneficiary text;
  family_has_member_numbers boolean := false;
BEGIN
  SELECT wm.phone_number INTO sender_phone
  FROM public.whatsapp_messages wm
  WHERE wm.message_id = _message_id
  LIMIT 1;

  IF coalesce(sender_phone, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'whatsapp_message_not_found');
  END IF;

  hospital_context := public.resolve_whatsapp_hospital_contact(sender_phone);
  IF coalesce((hospital_context->>'authorized')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', hospital_context->>'reason');
  END IF;

  hospital_id := (hospital_context->>'hospital_id')::uuid;
  normalized_name := public.normalize_whatsapp_identity_name(_patient_name);
  normalized_policy := upper(trim(coalesce(_policy_number, '')));
  IF normalized_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'patient_name_required');
  END IF;
  IF normalized_policy = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'policy_number_required');
  END IF;

  SELECT s.base_policy, s.member_suffix, s.is_family_policy
  INTO base_policy, member_suffix, is_family_policy
  FROM public.split_family_policy(normalized_policy) s;

  IF is_family_policy THEN
    SELECT EXISTS (
      SELECT 1 FROM public.nhis_beneficiaries nb
      WHERE regexp_replace(upper(trim(coalesce(nb.policy_number, ''))), '-[0-9]+$', '') = base_policy
        AND nullif(trim(nb.beneficiary_number), '') IS NOT NULL
    ) INTO family_has_member_numbers;
  END IF;

  IF is_family_policy AND family_has_member_numbers THEN
    -- A suffixed ID is an identity check, not just another spelling of the
    -- family policy. Never accept a different member based on name alone.
    SELECT count(*) INTO beneficiary_count
    FROM public.nhis_beneficiaries nb
    WHERE regexp_replace(upper(trim(coalesce(nb.policy_number, ''))), '-[0-9]+$', '') = base_policy
      AND regexp_replace(upper(trim(coalesce(nb.beneficiary_number, ''))), '\s+', '', 'g') = normalized_policy
      AND public.normalize_whatsapp_identity_name(nb.full_name) = normalized_name;
  ELSIF is_family_policy THEN
    -- Legacy registry rows without member IDs resolve a submitted suffix by
    -- family + exact name, matching the established WhatsApp behavior.
    SELECT count(*) INTO beneficiary_count
    FROM public.nhis_beneficiaries nb
    WHERE regexp_replace(upper(trim(coalesce(nb.policy_number, ''))), '-[0-9]+$', '') = base_policy
      AND public.normalize_whatsapp_identity_name(nb.full_name) = normalized_name;
  ELSE
    -- A bare family number is accepted for any member only when the list
    -- stores family numbers on each member row (the current import format).
    -- If a legacy list stores literal suffixed policy_number values, do not
    -- infer a dependent from the base number alone.
    SELECT count(*) INTO beneficiary_count
    FROM public.nhis_beneficiaries nb
    WHERE upper(trim(coalesce(nb.policy_number, ''))) = normalized_policy
      AND public.normalize_whatsapp_identity_name(nb.full_name) = normalized_name;
  END IF;

  IF beneficiary_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_mismatch');
  END IF;
  IF beneficiary_count > 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_ambiguous');
  END IF;

  SELECT nb.id, nb.full_name, nb.policy_number, nullif(trim(nb.beneficiary_number), '')
  INTO beneficiary_id, canonical_name, canonical_policy, canonical_beneficiary
  FROM public.nhis_beneficiaries nb
  WHERE regexp_replace(upper(trim(coalesce(nb.policy_number, ''))), '-[0-9]+$', '') = base_policy
    AND public.normalize_whatsapp_identity_name(nb.full_name) = normalized_name
    AND CASE
      WHEN is_family_policy AND family_has_member_numbers THEN
        regexp_replace(upper(trim(coalesce(nb.beneficiary_number, ''))), '\s+', '', 'g') = normalized_policy
      WHEN is_family_policy THEN true
      ELSE upper(trim(coalesce(nb.policy_number, ''))) = normalized_policy
    END
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'hospital_id', hospital_id,
    'hospital_contact_id', hospital_context->>'contact_name',
    'sender_phone', public.normalize_whatsapp_phone(sender_phone),
    'beneficiary_id', beneficiary_id,
    'patient_name', canonical_name,
    'policy_number', canonical_policy,
    'beneficiary_number', canonical_beneficiary,
    'submitted_policy_number', normalized_policy,
    'base_policy_number', base_policy,
    'member_suffix', member_suffix
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
  resolved_hospital uuid;
BEGIN
  IF lower(coalesce(NEW.source, '')) <> 'whatsapp' THEN
    RETURN NEW;
  END IF;
  IF coalesce(NEW.whatsapp_raw_message, '') = '' THEN
    RAISE EXCEPTION 'WhatsApp authorization requires a source message id';
  END IF;

  context := public.resolve_whatsapp_authorization_context(
    NEW.whatsapp_raw_message, NEW.patient_name, NEW.policy_number
  );
  IF coalesce((context->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'WhatsApp authorization rejected: %', coalesce(context->>'reason', 'security_validation_failed');
  END IF;

  resolved_hospital := (context->>'hospital_id')::uuid;
  IF NEW.hospital_id IS NOT NULL AND NEW.hospital_id <> resolved_hospital THEN
    RAISE EXCEPTION 'WhatsApp authorization hospital does not match authenticated sender';
  END IF;
  IF NEW.requesting_hospital_id IS NOT NULL AND NEW.requesting_hospital_id <> resolved_hospital THEN
    RAISE EXCEPTION 'WhatsApp requesting hospital does not match authenticated sender';
  END IF;

  NEW.hospital_id := resolved_hospital;
  NEW.requesting_hospital_id := resolved_hospital;
  SELECT h.name INTO NEW.hospital_name FROM public.hospitals h WHERE h.id = resolved_hospital;
  NEW.requesting_hospital_name := NEW.hospital_name;
  NEW.referring_hospital_id := resolved_hospital;
  NEW.referring_hospital_name := NEW.hospital_name;
  NEW.patient_name := context->>'patient_name';
  NEW.policy_number := context->>'policy_number';
  NEW.beneficiary_number := context->>'beneficiary_number';

  IF coalesce(NEW.clinical_notes, '') = '' THEN
    NEW.clinical_notes := jsonb_build_object(
      'whatsapp_submitted_policy', context->>'submitted_policy_number',
      'whatsapp_base_policy', context->>'base_policy_number',
      'whatsapp_member_suffix', context->>'member_suffix'
    )::text;
  ELSIF left(btrim(NEW.clinical_notes), 1) = '{' THEN
    BEGIN
      NEW.clinical_notes := (coalesce(NEW.clinical_notes::jsonb, '{}'::jsonb) || jsonb_build_object(
        'whatsapp_submitted_policy', context->>'submitted_policy_number',
        'whatsapp_base_policy', context->>'base_policy_number',
        'whatsapp_member_suffix', context->>'member_suffix'
      ))::text;
    EXCEPTION WHEN invalid_text_representation THEN
      NEW.clinical_notes := jsonb_build_object(
        'note', NEW.clinical_notes,
        'whatsapp_submitted_policy', context->>'submitted_policy_number',
        'whatsapp_base_policy', context->>'base_policy_number',
        'whatsapp_member_suffix', context->>'member_suffix'
      )::text;
    END;
  ELSE
    NEW.clinical_notes := jsonb_build_object(
      'note', NEW.clinical_notes,
      'whatsapp_submitted_policy', context->>'submitted_policy_number',
      'whatsapp_base_policy', context->>'base_policy_number',
      'whatsapp_member_suffix', context->>'member_suffix'
    )::text;
  END IF;

  sender_phone := context->>'sender_phone';
  IF coalesce(NEW.patient_phone, '') <> ''
     AND public.normalize_whatsapp_phone(NEW.patient_phone) = sender_phone THEN
    RAISE EXCEPTION 'WhatsApp authorization requires the patient phone, not the hospital sender phone';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
