-- Keep beneficiary identity strict while accepting ordinary first-name/surname
-- order differences between submitted requests and registry records.
CREATE OR REPLACE FUNCTION public.normalize_beneficiary_name(_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    array_to_string(
      ARRAY(
        SELECT token
        FROM unnest(
          regexp_split_to_array(
            regexp_replace(
              lower(trim(coalesce(_name, ''))),
              '[^a-z0-9]+',
              ' ',
              'g'
            ),
            '\s+'
          )
        ) AS token
        WHERE token <> ''
        ORDER BY token
      ),
      ' '
    ),
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.normalize_beneficiary_name(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_beneficiary_name(text) TO service_role;

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
  matched_via text;
  beneficiary_count integer;
  beneficiary_id uuid;
  canonical_name text;
  canonical_policy text;
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

  SELECT s.base_policy, s.member_suffix, s.is_family_policy
  INTO base_policy, member_suffix, is_family_policy
  FROM public.split_family_policy(normalized_policy) s;

  SELECT count(*) INTO beneficiary_count
  FROM public.nhis_beneficiaries nb
  WHERE upper(trim(coalesce(nb.policy_number, ''))) = normalized_policy
    AND public.normalize_beneficiary_name(nb.full_name) = normalized_name;
  matched_via := 'exact';

  IF beneficiary_count = 0 AND is_family_policy THEN
    SELECT count(*) INTO beneficiary_count
    FROM public.nhis_beneficiaries nb
    WHERE upper(trim(coalesce(nb.policy_number, ''))) = base_policy
      AND public.normalize_beneficiary_name(nb.full_name) = normalized_name;
    matched_via := 'base';
  END IF;

  IF beneficiary_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_mismatch');
  END IF;
  IF beneficiary_count > 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_ambiguous');
  END IF;

  IF matched_via = 'base' THEN
    SELECT nb.id, nb.full_name, nb.policy_number
    INTO beneficiary_id, canonical_name, canonical_policy
    FROM public.nhis_beneficiaries nb
    WHERE upper(trim(coalesce(nb.policy_number, ''))) = base_policy
      AND public.normalize_beneficiary_name(nb.full_name) = normalized_name
    LIMIT 1;
  ELSE
    SELECT nb.id, nb.full_name, nb.policy_number
    INTO beneficiary_id, canonical_name, canonical_policy
    FROM public.nhis_beneficiaries nb
    WHERE upper(trim(coalesce(nb.policy_number, ''))) = normalized_policy
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

CREATE OR REPLACE FUNCTION public.resolve_nhis_family_members(_policy text)
RETURNS SETOF public.nhis_beneficiaries
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH resolved AS (
    SELECT base_policy
    FROM public.split_family_policy(_policy)
  )
  SELECT nb.*
  FROM public.nhis_beneficiaries nb
  CROSS JOIN resolved r
  WHERE (SELECT base_policy FROM public.split_family_policy(nb.policy_number)) =
    r.base_policy;
$$;

REVOKE ALL ON FUNCTION public.resolve_nhis_family_members(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_nhis_family_members(text) TO authenticated;
