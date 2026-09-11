-- Resolve family beneficiaries whether the registry stores base or suffixed
-- policy numbers. Beneficiary identity remains exact after normalization.
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
  beneficiary_count integer;
  beneficiary_id uuid;
  canonical_name text;
  canonical_policy text;
  matched_via text;
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
  normalized_name := public.normalize_beneficiary_name(_patient_name);
  normalized_policy := upper(trim(coalesce(_policy_number, '')));

  IF normalized_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'patient_name_required');
  END IF;
  IF normalized_policy = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'policy_number_required');
  END IF;

  SELECT s.base_policy, s.member_suffix
  INTO base_policy, member_suffix
  FROM public.split_family_policy(normalized_policy) s;

  SELECT count(*) INTO beneficiary_count
  FROM public.nhis_beneficiaries nb
  WHERE upper(trim(coalesce(nb.policy_number, ''))) = normalized_policy
    AND public.normalize_beneficiary_name(nb.full_name) = normalized_name;
  matched_via := 'exact';

  -- A family can be stored as base-only rows or as suffixed rows. Resolve the
  -- family base in both directions, but never choose a beneficiary by position.
  IF beneficiary_count = 0 THEN
    SELECT count(*) INTO beneficiary_count
    FROM public.nhis_beneficiaries nb
    WHERE (SELECT s.base_policy FROM public.split_family_policy(nb.policy_number) s) = base_policy
      AND public.normalize_beneficiary_name(nb.full_name) = normalized_name;
    matched_via := 'family';
  END IF;

  IF beneficiary_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_mismatch');
  END IF;
  IF beneficiary_count > 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_ambiguous');
  END IF;

  IF matched_via = 'exact' THEN
    SELECT nb.id, nb.full_name, nb.policy_number
    INTO beneficiary_id, canonical_name, canonical_policy
    FROM public.nhis_beneficiaries nb
    WHERE upper(trim(coalesce(nb.policy_number, ''))) = normalized_policy
      AND public.normalize_beneficiary_name(nb.full_name) = normalized_name
    LIMIT 1;
  ELSE
    SELECT nb.id, nb.full_name, nb.policy_number
    INTO beneficiary_id, canonical_name, canonical_policy
    FROM public.nhis_beneficiaries nb
    WHERE (SELECT s.base_policy FROM public.split_family_policy(nb.policy_number) s) = base_policy
      AND public.normalize_beneficiary_name(nb.full_name) = normalized_name
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'hospital_id', hospital_id,
    'hospital_contact_id', hospital_context->>'contact_name',
    'sender_phone', public.normalize_whatsapp_phone(sender_phone),
    'beneficiary_id', beneficiary_id,
    'patient_name', canonical_name,
    'policy_number', canonical_policy,
    'submitted_policy_number', normalized_policy,
    'base_policy_number', base_policy,
    'member_suffix', member_suffix
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_whatsapp_authorization_context(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_whatsapp_authorization_context(text, text, text)
  TO service_role;
