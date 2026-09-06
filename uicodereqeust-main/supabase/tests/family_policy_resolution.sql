-- supabase/tests/family_policy_resolution.sql
--
-- Repeatable demonstration that hyphenated NHIA family-policy inputs resolve in
-- BOTH supported database situations, including the existing base-only
-- production model.
--
--   Situation B (production today): every family member shares the base policy
--      1639554 -> PRINCIPAL PERSON A
--      1639554 -> CHILD     PERSON B
--      1639554 -> CHILD     PERSON C
--      1639554 -> SPOUSE    PERSON D
--   Situation A: the database stores the suffixed policy verbatim.
--
-- Requirements covered:
--   * 1639554-1 / -2 / -3 resolve the correct beneficiary via the base policy
--     + exact-name validation (never principal, never first row, never fuzzy).
--   * Wrong names fail. Unknown base policies fail. Ambiguous matches fail.
--   * The submitted policy, base policy and member suffix are preserved.
--
-- Prerequisites:
--   * The migration 20260907090000_family_policy_beneficiary_resolution.sql
--     must already be applied.
--   * Run as a superuser / postgres / service-role session so
--     session_replication_role can be set (fixture FKs point at fake UUIDs).
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/family_policy_resolution.sql
--
-- Everything runs inside one transaction that is ROLLED BACK at the end, so no
-- fixture rows survive.

BEGIN;

-- Fixture rows reference fake UUIDs; replica mode disables FK checks so the
-- fixture rows can exist without touching auth.users/hospitals. Nothing leaks
-- out of the transaction.
SET LOCAL session_replication_role = replica;

-- Fixture: the WhatsApp hospital sender.
INSERT INTO public.whatsapp_messages (message_id, phone_number)
VALUES ('family-test-msg-0001', '2348140000000');

INSERT INTO public.user_roles (
  user_id, role, full_name, phone, hospital_id, access_status
) VALUES (
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'hospital',
  'TEST HOSPITAL CONTACT',
  '2348140000000',
  '00000000-0000-0000-0000-0000000000a2'::uuid,
  'active'
);

-- Assertion helper:
--   p_expected_reason IS NULL  => expect ok:true (+ optional canonical identity)
--   p_expected_reason NOT NULL => expect ok:false with that exact reason
CREATE OR REPLACE FUNCTION pg_temp.assert_resolution(
  p_label text,
  p_patient_name text,
  p_policy_number text,
  p_expected_reason text DEFAULT NULL,
  p_expected_patient_name text DEFAULT NULL,
  p_expected_policy text DEFAULT NULL
) RETURNS void AS $$
DECLARE
  ctx jsonb;
  ok boolean;
BEGIN
  ctx := public.resolve_whatsapp_authorization_context(
    'family-test-msg-0001', p_patient_name, p_policy_number
  );
  ok := coalesce((ctx->>'ok')::boolean, false);

  IF p_expected_reason IS NULL THEN
    IF NOT ok THEN
      RAISE EXCEPTION '[%] expected ok for policy=% name="%" but got: %',
        p_label, p_policy_number, p_patient_name, ctx;
    END IF;
    IF p_expected_patient_name IS NOT NULL
       AND ctx->>'patient_name' <> p_expected_patient_name THEN
      RAISE EXCEPTION '[%] expected patient_name="%" but got "%"',
        p_label, p_expected_patient_name, ctx->>'patient_name';
    END IF;
    IF p_expected_policy IS NOT NULL
       AND upper(trim(coalesce(ctx->>'policy_number', '')))
          <> upper(trim(p_expected_policy)) THEN
      RAISE EXCEPTION '[%] expected policy_number="%" but got "%"',
        p_label, p_expected_policy, ctx->>'policy_number';
    END IF;
  ELSE
    IF ok OR (ctx->>'reason') IS DISTINCT FROM p_expected_reason THEN
      RAISE EXCEPTION '[%] expected reason "%" but got: %',
        p_label, p_expected_reason, ctx;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ── 0. split_family_policy unit checks (pure function) ──────────────────────
DO $$
DECLARE
  b text; s text; f boolean;
BEGIN
  SELECT base_policy, member_suffix, is_family_policy
  INTO b, s, f FROM public.split_family_policy('1639554-2');
  IF b <> '1639554' OR s <> '2' OR NOT f THEN
    RAISE EXCEPTION 'split_family_policy(1639554-2) = (%, %, %)', b, s, f;
  END IF;

  SELECT base_policy, member_suffix, is_family_policy
  INTO b, s, f FROM public.split_family_policy('1639554');
  IF b <> '1639554' OR s IS NOT NULL OR f THEN
    RAISE EXCEPTION 'split_family_policy(1639554) = (%, %, %)', b, s, f;
  END IF;

  SELECT base_policy, member_suffix, is_family_policy
  INTO b, s, f FROM public.split_family_policy('ABC-001');
  IF b <> 'ABC-001' OR s IS NOT NULL OR f THEN
    RAISE EXCEPTION 'split_family_policy(ABC-001) = (%, %, %)', b, s, f;
  END IF;
END $$;
-- ── 1. Situation B: base-only database (the current production model) ────────
INSERT INTO public.nhis_beneficiaries (
  policy_number, member_type, surname, first_name, full_name, gender, dob
) VALUES
  ('1639554', 'PRINCIPAL', 'A', 'PERSON', 'PERSON A', 'M', '01/01/1980'),
  ('1639554', 'CHILD',     'B', 'PERSON', 'PERSON B', 'F', '02/02/1982'),
  ('1639554', 'CHILD',     'C', 'PERSON', 'PERSON C', 'M', '03/03/1984'),
  ('1639554', 'SPOUSE',    'D', 'PERSON', 'PERSON D', 'F', '04/04/1986');

-- Principal with bare policy — behaves exactly as before.
SELECT pg_temp.assert_resolution('B-principal', 'PERSON A', '1639554',
                                 NULL, 'PERSON A', '1639554');
-- Dependents with suffixed inputs against base-only rows.
SELECT pg_temp.assert_resolution('B-sfx-1', 'PERSON B', '1639554-1',
                                 NULL, 'PERSON B', '1639554');
SELECT pg_temp.assert_resolution('B-sfx-2', 'PERSON C', '1639554-2',
                                 NULL, 'PERSON C', '1639554');
SELECT pg_temp.assert_resolution('B-sfx-3', 'PERSON D', '1639554-3',
                                 NULL, 'PERSON D', '1639554');
-- Case/whitespace canonicalization is unchanged (exact, but case-insensitive).
SELECT pg_temp.assert_resolution('B-case', 'person   c ', ' 1639554-2 ',
                                 NULL, 'PERSON C', '1639554');
-- Wrong name for a valid family policy.
SELECT pg_temp.assert_resolution('B-wrong-name', 'COMPLETELY DIFFERENT PERSON',
                                 '1639554-2', 'beneficiary_mismatch');
-- Unknown base policy.
SELECT pg_temp.assert_resolution('B-unknown-base', 'PERSON C', '9999999-2',
                                 'beneficiary_mismatch');
-- No-principal fallback: 1639554-2 + PERSON C must resolve PERSON C (never A),
-- and the submitted/base/member metadata must be preserved.
DO $$
DECLARE
  ctx jsonb;
BEGIN
  ctx := public.resolve_whatsapp_authorization_context(
    'family-test-msg-0001', 'PERSON C', '1639554-2'
  );
  IF coalesce((ctx->>'ok')::boolean, false) IS NOT TRUE
     OR ctx->>'patient_name' <> 'PERSON C' THEN
    RAISE EXCEPTION 'no-principal-fallback violated: %', ctx;
  END IF;
  IF ctx->>'submitted_policy_number' <> '1639554-2'
     OR ctx->>'base_policy_number' <> '1639554'
     OR ctx->>'member_suffix' <> '2' THEN
    RAISE EXCEPTION 'policy metadata not preserved: %', ctx;
  END IF;
END $$;
-- ── 2. Situation A: database stores the suffixed policy verbatim ─────────────
DELETE FROM public.nhis_beneficiaries;
INSERT INTO public.nhis_beneficiaries (
  policy_number, member_type, surname, first_name, full_name, gender, dob
) VALUES
  ('1639554',   'PRINCIPAL', 'A', 'PERSON', 'PERSON A', 'M', '01/01/1980'),
  ('1639554-1', 'CHILD',     'B', 'PERSON', 'PERSON B', 'F', '02/02/1982'),
  ('1639554-2', 'CHILD',     'C', 'PERSON', 'PERSON C', 'M', '03/03/1984'),
  ('1639554-3', 'SPOUSE',    'D', 'PERSON', 'PERSON D', 'F', '04/04/1986');

-- Exact suffixed rows resolve with their own canonical identity.
SELECT pg_temp.assert_resolution('A-sfx-2', 'PERSON C', '1639554-2',
                                 NULL, 'PERSON C', '1639554-2');
SELECT pg_temp.assert_resolution('A-sfx-1', 'PERSON B', '1639554-1',
                                 NULL, 'PERSON B', '1639554-1');
-- The principal with the bare policy still resolves.
SELECT pg_temp.assert_resolution('A-principal', 'PERSON A', '1639554',
                                 NULL, 'PERSON A', '1639554');
-- Wrong name / unknown policy fail safely here too.
SELECT pg_temp.assert_resolution('A-wrong-name', 'SOMEONE ELSE', '1639554-2',
                                 'beneficiary_mismatch');
SELECT pg_temp.assert_resolution('A-unknown-base', 'PERSON D', '9999999-3',
                                 'beneficiary_mismatch');
-- In Situation A the bare base policy only covers the principal: submitting the
-- bare base policy with a dependent's name must NOT reverse-guess the suffix.
SELECT pg_temp.assert_resolution('A-no-reverse-guess', 'PERSON D', '1639554',
                                 'beneficiary_mismatch');

-- ── 3. Genuine ambiguity: duplicate rows must never be guessed ───────────────
DELETE FROM public.nhis_beneficiaries;
INSERT INTO public.nhis_beneficiaries (
  policy_number, member_type, surname, first_name, full_name, gender, dob
) VALUES
  ('1639554', 'CHILD', 'C', 'PERSON', 'PERSON C', 'M', '03/03/1984'),
  ('1639554', 'CHILD', 'C', 'PERSON', 'PERSON C', 'M', '03/03/1984');

SELECT pg_temp.assert_resolution('AMB-dup', 'PERSON C', '1639554-2',
                                 'beneficiary_ambiguous');
-- ── 4. End-to-end BEFORE INSERT trigger path (Situation B) ───────────────────
-- Switch back to origin so the real trigger (and FK checks) run. A real
-- hospitals row is needed because the trigger resolves hospital_name.
DELETE FROM public.nhis_beneficiaries;
INSERT INTO public.nhis_beneficiaries (
  policy_number, member_type, surname, first_name, full_name, gender, dob
) VALUES
  ('1639554', 'PRINCIPAL', 'A', 'PERSON', 'PERSON A', 'M', '01/01/1980'),
  ('1639554', 'CHILD',     'C', 'PERSON', 'PERSON C', 'M', '03/03/1984');

INSERT INTO public.hospitals (id, name, code, is_active)
VALUES ('00000000-0000-0000-0000-0000000000a2'::uuid,
        'TEST FAMILY HOSPITAL', 'TEST0001', true);

SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE _auth_out (
  id uuid,
  patient_name text,
  policy_number text,
  hospital_name text,
  clinical_notes text
);

WITH ins AS (
  INSERT INTO public.authorization_requests (
    patient_name, policy_number, diagnosis, treatment,
    source, whatsapp_raw_message, patient_phone, clinical_notes
  ) VALUES (
    'PERSON C', '1639554-2', 'HTN', 'Tab Amlodipine 10mg',
    'whatsapp', 'family-test-msg-0001', '2348030000000',
    '{"source":"whatsapp","captured_at":"2026-09-07T00:00:00Z"}'::text
  )
  RETURNING id, patient_name, policy_number, hospital_name, clinical_notes
)
INSERT INTO _auth_out SELECT * FROM ins;

DO $$
DECLARE
  r record;
  notes jsonb;
BEGIN
  SELECT * INTO r FROM _auth_out LIMIT 1;
  IF r.patient_name <> 'PERSON C' OR r.policy_number <> '1639554' THEN
    RAISE EXCEPTION 'trigger did not canonicalize identity: %', r;
  END IF;
  IF r.hospital_name <> 'TEST FAMILY HOSPITAL' THEN
    RAISE EXCEPTION 'trigger did not resolve hospital name: %', r.hospital_name;
  END IF;
  notes := r.clinical_notes::jsonb;
  IF notes->>'whatsapp_submitted_policy' <> '1639554-2'
     OR notes->>'whatsapp_base_policy' <> '1639554'
     OR notes->>'whatsapp_member_suffix' <> '2' THEN
    RAISE EXCEPTION 'clinical_notes policy metadata missing: %', notes;
  END IF;
  IF notes->>'source' <> 'whatsapp' THEN
    RAISE EXCEPTION 'clinical_notes lost the original payload: %', notes;
  END IF;
END $$;

-- ── All assertions passed. Roll back every fixture row. ──────────────────────
ROLLBACK;
