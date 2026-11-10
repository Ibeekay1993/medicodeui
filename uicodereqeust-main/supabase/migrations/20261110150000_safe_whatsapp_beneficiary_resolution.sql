BEGIN;

-- Keep the database comparison consistent with the client normalizer for
-- member identifiers: ignore formatting characters/case and normalize a
-- zero-padded numeric dependant suffix without changing the stored source.
CREATE OR REPLACE FUNCTION public.normalize_whatsapp_beneficiary_number(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $func$
  SELECT regexp_replace(
    regexp_replace(upper(trim(coalesce(_value, ''))), '[^[:alnum:]-]', '', 'g'),
    '-0+([1-9][0-9]*)$',
    '-\1'
  );
$func$;

REVOKE ALL ON FUNCTION public.normalize_whatsapp_beneficiary_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_whatsapp_beneficiary_number(text) TO service_role, postgres;

-- Keep identifier lookup index-backed even when incoming identifiers contain
-- spaces or case differences. Name comparison is restricted to the matched
-- policy/member candidates, never run as an unscoped fuzzy scan.
CREATE INDEX IF NOT EXISTS idx_nhis_beneficiaries_beneficiary_number_normalized
  ON public.nhis_beneficiaries (
    (public.normalize_whatsapp_beneficiary_number(beneficiary_number))
  )
  WHERE beneficiary_number IS NOT NULL;

-- The 4th argument carries an exact member identifier independently of the
-- family policy. The default preserves callers that still submit 3 arguments.
DROP FUNCTION IF EXISTS public.resolve_whatsapp_authorization_context(text, text, text);

CREATE FUNCTION public.resolve_whatsapp_authorization_context(
  _message_id text,
  _patient_name text,
  _policy_number text,
  _beneficiary_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  sender_phone text;
  hospital_context jsonb;
  hospital_id uuid;
  normalized_policy text;
  base_policy text;
  member_suffix text;
  is_family_policy boolean;
  supplied_member_number text;
  member_number_to_match text;
  family_has_member_numbers boolean := false;
  candidate_count integer := 0;
  beneficiary_id uuid;
  canonical_name text;
  canonical_policy text;
  canonical_beneficiary text;
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
  normalized_policy := upper(regexp_replace(trim(coalesce(_policy_number, '')), '\s+', '', 'g'));
  supplied_member_number := nullif(
    public.normalize_whatsapp_beneficiary_number(_beneficiary_number),
    ''
  );

  IF nullif(public.normalize_whatsapp_identity_name(_patient_name), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'patient_name_required');
  END IF;
  IF normalized_policy = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'policy_number_required');
  END IF;

  SELECT split.base_policy, split.member_suffix, split.is_family_policy
  INTO base_policy, member_suffix, is_family_policy
  FROM public.split_family_policy(normalized_policy) split;

  IF nullif(trim(base_policy), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'policy_number_required');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.nhis_beneficiaries nb
    WHERE nb.policy_number = base_policy
      AND nullif(trim(nb.beneficiary_number), '') IS NOT NULL
  ) INTO family_has_member_numbers;

  -- If a separate member ID was provided, it is authoritative. A suffix in
  -- the policy field is also treated as an exact member ID when the registry
  -- has member identifiers. Identifier disagreement is a hard conflict.
  member_number_to_match := supplied_member_number;
  IF member_number_to_match IS NULL
     AND is_family_policy
     AND nullif(member_suffix, '') IS NOT NULL
     AND family_has_member_numbers THEN
    member_number_to_match := public.normalize_whatsapp_beneficiary_number(normalized_policy);
  END IF;

  IF member_number_to_match IS NOT NULL THEN
    SELECT count(*) INTO candidate_count
    FROM public.nhis_beneficiaries nb
    WHERE nb.policy_number = base_policy
      AND public.normalize_whatsapp_beneficiary_number(nb.beneficiary_number) = member_number_to_match
      AND public.match_whatsapp_identity_name(_patient_name, nb.full_name);

    IF candidate_count = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_conflict');
    END IF;
    IF candidate_count > 1 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_ambiguous');
    END IF;
  ELSE
    -- With no member ID, require one exact normalized full-name match within
    -- the family policy. Shared family policy numbers alone never identify a
    -- person, and token subsets are deliberately not accepted.
    SELECT count(*) INTO candidate_count
    FROM public.nhis_beneficiaries nb
    WHERE nb.policy_number = base_policy
      AND public.match_whatsapp_identity_name(_patient_name, nb.full_name);

    -- Preserve legacy rows that stored a suffixed policy_number when the
    -- active registry has no exact base-policy rows.
    IF candidate_count = 0 AND is_family_policy AND NOT family_has_member_numbers THEN
      SELECT count(*) INTO candidate_count
      FROM public.nhis_beneficiaries nb
      WHERE nb.policy_number LIKE base_policy || '-%'
        AND public.match_whatsapp_identity_name(_patient_name, nb.full_name);
    END IF;

    IF candidate_count = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_mismatch');
    END IF;
    IF candidate_count > 1 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_ambiguous');
    END IF;
  END IF;

  SELECT nb.id, nb.full_name, nb.policy_number, nullif(trim(nb.beneficiary_number), '')
  INTO beneficiary_id, canonical_name, canonical_policy, canonical_beneficiary
  FROM public.nhis_beneficiaries nb
  WHERE nb.policy_number = base_policy
    AND public.match_whatsapp_identity_name(_patient_name, nb.full_name)
    AND (
      member_number_to_match IS NULL
      OR public.normalize_whatsapp_beneficiary_number(nb.beneficiary_number) = member_number_to_match
    )
  LIMIT 1;

  IF beneficiary_id IS NULL AND is_family_policy AND NOT family_has_member_numbers THEN
    SELECT nb.id, nb.full_name, nb.policy_number, nullif(trim(nb.beneficiary_number), '')
    INTO beneficiary_id, canonical_name, canonical_policy, canonical_beneficiary
    FROM public.nhis_beneficiaries nb
    WHERE nb.policy_number LIKE base_policy || '-%'
      AND public.match_whatsapp_identity_name(_patient_name, nb.full_name)
    LIMIT 1;
  END IF;

  IF beneficiary_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_mismatch');
  END IF;

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
$func$;

REVOKE ALL ON FUNCTION public.resolve_whatsapp_authorization_context(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_whatsapp_authorization_context(text, text, text, text) TO service_role, postgres;

-- The insert trigger must pass the beneficiary identifier too; otherwise
-- browser/worker validation could be stricter than the database write guard.
CREATE OR REPLACE FUNCTION public.enforce_whatsapp_authorization_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
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
    NEW.whatsapp_raw_message,
    NEW.patient_name,
    NEW.policy_number,
    NEW.beneficiary_number
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
$func$;

COMMIT;
