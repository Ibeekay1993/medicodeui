-- Family policy (NHIA number with member suffix) beneficiary resolution.
--
-- Problem: NHIA family policies are represented like `1639554`, `1639554-1`,
-- `1639554-2`, `1639554-3`. These all belong to the SAME base family policy
-- `1639554`; the hyphen suffix identifies the family member's position within
-- the family. The suffix MUST NOT be required to exist as a literal string in
-- nhis_beneficiaries.policy_number, and MUST NOT by itself select a
-- beneficiary.
--
-- Two database situations must both work:
--   A. the database stores the suffixed policy verbatim (e.g. '1639554-2');
--   B. the existing production model where every family member shares the
--      base policy (e.g. four rows with policy_number = '1639554').
--
-- Resolution rule (unchanged security posture):
--   submitted policy (%digits%-%digits%)  ->  base family policy (%digits%)
--       ->  retrieve the family's beneficiaries via the BASE policy
--       ->  identify the beneficiary with the EXISTING exact-name validation
--       ->  never fall back to the principal, never pick "first row", never
--           fuzzy-match.
-- The exact submitted policy is still tried first so Situation A keeps
-- working verbatim.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Pure decomposer: splits a policy number into base policy + member suffix.
--    Only the exact form `digits-digits` is treated as a family policy.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.split_family_policy(_policy text)
RETURNS TABLE (
  base_policy text,
  member_suffix text,
  is_family_policy boolean
)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE WHEN btrim(coalesce(_policy, '')) ~ '^[0-9]+-[0-9]+$'
         THEN split_part(btrim(_policy), '-', 1)
         ELSE btrim(coalesce(_policy, ''))
    END,
    CASE WHEN btrim(coalesce(_policy, '')) ~ '^[0-9]+-[0-9]+$'
         THEN split_part(btrim(_policy), '-', 2)
         ELSE NULL::text
    END,
    (btrim(coalesce(_policy, '')) ~ '^[0-9]+-[0-9]+$');
$$;

REVOKE ALL ON FUNCTION public.split_family_policy(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.split_family_policy(text) TO service_role;
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. WhatsApp authorization context resolution.
--    Security model (unchanged):
--      * WhatsApp sender must resolve to an ACTIVE hospital user in user_roles.
--      * Patient name + policy number must match the SAME live NHIS
--        beneficiary. The name match remains EXACT (case/whitespace
--        normalized) — never fuzzy, never row-order, never principal fallback.
--      * Hospital identity is derived from the sender phone only.
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- Decompose. `1639554-2` -> base `1639554`, suffix `2`. The suffix is
  -- retained as metadata only; it never becomes a lookup key.
  SELECT s.base_policy, s.member_suffix, s.is_family_policy
  INTO base_policy, member_suffix, is_family_policy
  FROM public.split_family_policy(normalized_policy) s;

  -- Strategy 1: exact submitted policy (Situation A — database stores the
  -- suffixed family policy verbatim, e.g. '1639554-2').
  SELECT count(*) INTO beneficiary_count
  FROM public.nhis_beneficiaries nb
  WHERE upper(trim(coalesce(nb.policy_number, ''))) = normalized_policy
    AND regexp_replace(lower(trim(coalesce(nb.full_name, ''))), '\s+', ' ', 'g') = normalized_name;
  matched_via := 'exact';

  -- Strategy 2: exact submitted policy absent -> resolve through the BASE
  -- family policy (Situation B — every member shares the base policy). The
  -- beneficiary is still identified by the SAME exact-name validation. No
  -- automatic principal selection, no "first row" guessing.
  IF beneficiary_count = 0 AND is_family_policy THEN
    SELECT count(*) INTO beneficiary_count
    FROM public.nhis_beneficiaries nb
    WHERE upper(trim(coalesce(nb.policy_number, ''))) = base_policy
      AND regexp_replace(lower(trim(coalesce(nb.full_name, ''))), '\s+', ' ', 'g') = normalized_name;
    matched_via := 'base';
  END IF;

  IF beneficiary_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_mismatch');
  END IF;
  IF beneficiary_count > 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'beneficiary_ambiguous');
  END IF;

  -- Fetch the single canonical beneficiary with exactly the predicate that
  -- produced the count above (deterministic — never two different predicates).
  IF matched_via = 'base' THEN
    SELECT nb.id, nb.full_name, nb.policy_number
    INTO beneficiary_id, canonical_name, canonical_policy
    FROM public.nhis_beneficiaries nb
    WHERE upper(trim(coalesce(nb.policy_number, ''))) = base_policy
      AND regexp_replace(lower(trim(coalesce(nb.full_name, ''))), '\s+', ' ', 'g') = normalized_name
    LIMIT 1;
  ELSE
    SELECT nb.id, nb.full_name, nb.policy_number
    INTO beneficiary_id, canonical_name, canonical_policy
    FROM public.nhis_beneficiaries nb
    WHERE upper(trim(coalesce(nb.policy_number, ''))) = normalized_policy
      AND regexp_replace(lower(trim(coalesce(nb.full_name, ''))), '\s+', ' ', 'g') = normalized_name
    LIMIT 1;
  END IF;

  -- Patient phone is intentionally NOT sourced from the hospital sender.
  -- The WhatsApp worker supplies the patient's phone separately when captured.
  RETURN jsonb_build_object(
    'ok', true,
    'hospital_id', hospital_id,
    'hospital_contact_id', hospital_context->>'contact_name',
    'sender_phone', public.normalize_whatsapp_phone(sender_phone),
    'beneficiary_id', beneficiary_id,
    'patient_name', canonical_name,
    'policy_number', canonical_policy,
    -- Audit metadata: the exact form the hospital submitted and how it was
    -- decomposed. None of these gate the authorization.
    'submitted_policy_number', normalized_policy,
    'base_policy_number', base_policy,
    'member_suffix', member_suffix
  );
END;
$$;
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. BEFORE INSERT security trigger — extended to preserve the submitted
--    family-policy form (e.g. '1639554-2') and the resolved base policy /
--    member suffix inside authorization_requests.clinical_notes (TEXT holds a
--    JSON object). All EXISTING checks are unchanged: sender-hospital match,
--    requesting-hospital match, canonical identity, patient-phone guard.
-- ─────────────────────────────────────────────────────────────────────────────
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
-- Preserve the submitted family-policy form plus the resolved base policy /
  -- member suffix for audit. The suffix is metadata — it never gates anything.
  IF coalesce(NEW.clinical_notes, '') = '' THEN
    NEW.clinical_notes := jsonb_build_object(
      'whatsapp_submitted_policy', context->>'submitted_policy_number',
      'whatsapp_base_policy', context->>'base_policy_number',
      'whatsapp_member_suffix', context->>'member_suffix'
    )::text;
  ELSIF left(btrim(NEW.clinical_notes), 1) = '{' THEN
    BEGIN
      NEW.clinical_notes := (
        COALESCE(NEW.clinical_notes::jsonb, '{}'::jsonb)
        || jsonb_build_object(
             'whatsapp_submitted_policy', context->>'submitted_policy_number',
             'whatsapp_base_policy', context->>'base_policy_number',
             'whatsapp_member_suffix', context->>'member_suffix'
           )
      )::text;
    EXCEPTION
      WHEN invalid_text_representation THEN
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

  -- Never let a WhatsApp hospital sender become the patient's notification number.
  sender_phone := context->>'sender_phone';
  IF coalesce(NEW.patient_phone, '') <> ''
     AND public.normalize_whatsapp_phone(NEW.patient_phone) = sender_phone THEN
    RAISE EXCEPTION 'WhatsApp authorization requires the patient phone, not the hospital sender phone';
  END IF;

  RETURN NEW;
END;
$$;