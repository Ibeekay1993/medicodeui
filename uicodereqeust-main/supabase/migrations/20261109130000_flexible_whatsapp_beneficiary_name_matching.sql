BEGIN;

-- Flexible WhatsApp beneficiary name matching:
-- Handles extra or omitted middle names/titles/honorifics while requiring an
-- order-insensitive match and preserving exact beneficiary-number checks for
-- family members.
CREATE OR REPLACE FUNCTION public.match_whatsapp_identity_name(
  _submitted_name text,
  _db_name text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $func$
  WITH s AS (
    SELECT array_agg(DISTINCT token ORDER BY token) as tokens
    FROM regexp_split_to_table(regexp_replace(lower(trim(coalesce(_submitted_name, ''))), '[^a-z0-9]+', ' ', 'g'), '\s+') as t(token)
    WHERE token <> ''
  ),
  d AS (
    SELECT array_agg(DISTINCT token ORDER BY token) as tokens
    FROM regexp_split_to_table(regexp_replace(lower(trim(coalesce(_db_name, ''))), '[^a-z0-9]+', ' ', 'g'), '\s+') as t(token)
    WHERE token <> ''
  )
  SELECT CASE
    -- Guard: both must have tokens
    WHEN coalesce(cardinality(s.tokens), 0) = 0 OR coalesce(cardinality(d.tokens), 0) = 0 THEN false
    -- 1. Exact token set equality (order-insensitive)
    WHEN s.tokens = d.tokens THEN true
    -- 2. DB name (at least 2 tokens) is a subset of submitted name (submitted has additional middle name/title)
    WHEN cardinality(d.tokens) >= 2 AND d.tokens <@ s.tokens THEN true
    -- 3. Submitted name (at least 2 tokens) is a subset of DB name (DB has middle name omitted by submitter)
    WHEN cardinality(s.tokens) >= 2 AND s.tokens <@ d.tokens THEN true
    ELSE false
  END
  FROM s CROSS JOIN d;
$func$;

REVOKE ALL ON FUNCTION public.match_whatsapp_identity_name(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_whatsapp_identity_name(text, text) TO service_role, postgres;

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
AS $func$
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
      AND public.match_whatsapp_identity_name(_patient_name, nb.full_name);
  ELSIF is_family_policy THEN
    -- Legacy registry rows without member IDs resolve a submitted suffix by
    -- family + exact/subset name, matching the established WhatsApp behavior.
    SELECT count(*) INTO beneficiary_count
    FROM public.nhis_beneficiaries nb
    WHERE regexp_replace(upper(trim(coalesce(nb.policy_number, ''))), '-[0-9]+$', '') = base_policy
      AND public.match_whatsapp_identity_name(_patient_name, nb.full_name);
  ELSE
    -- A bare family number is accepted for any member only when the list
    -- stores family numbers on each member row (the current import format).
    -- If a legacy list stores literal suffixed policy_number values, do not
    -- infer a dependent from the base number alone.
    SELECT count(*) INTO beneficiary_count
    FROM public.nhis_beneficiaries nb
    WHERE upper(trim(coalesce(nb.policy_number, ''))) = normalized_policy
      AND public.match_whatsapp_identity_name(_patient_name, nb.full_name);
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
    AND public.match_whatsapp_identity_name(_patient_name, nb.full_name)
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
$func$;

REVOKE ALL ON FUNCTION public.resolve_whatsapp_authorization_context(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_whatsapp_authorization_context(text, text, text) TO service_role, postgres;

COMMIT;
