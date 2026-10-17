BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(53);

CREATE TEMP TABLE whatsapp_tariff_guard_test_rows (
  id integer PRIMARY KEY,
  request_id text,
  source text,
  status text,
  approved_items jsonb,
  diagnosis text,
  treatment text,
  whatsapp_message_id text,
  whatsapp_raw_message text,
  patient_name text,
  policy_number text,
  beneficiary_number text,
  patient_phone text,
  hospital_id uuid,
  hospital_name text,
  requesting_hospital_id uuid,
  requesting_hospital_name text,
  referring_hospital_id uuid,
  referring_hospital_name text,
  referred_hospital_id uuid,
  submitted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_unlocked boolean NOT NULL DEFAULT false,
  decided_at timestamptz,
  decided_by uuid,
  approved_by uuid,
  authorization_code text,
  decision_reason text,
  total_amount numeric
);

-- Seed one pre-migration approval before installing the guard triggers. This
-- models a historical row whose original tariff cart is no longer available.
INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows
  (id, source, status, approved_items, diagnosis, treatment)
VALUES (24, 'whatsapp', 'approved', '[]'::jsonb, 'Historical diagnosis', 'Historical treatment');

CREATE TRIGGER a_test_canonicalize_whatsapp_authorization_source
  BEFORE INSERT
  ON pg_temp.whatsapp_tariff_guard_test_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.canonicalize_whatsapp_authorization_source();
CREATE TRIGGER a_test_whatsapp_tariff_confirmation_insert
  BEFORE INSERT
  ON pg_temp.whatsapp_tariff_guard_test_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_whatsapp_tariff_confirmation();
CREATE TRIGGER a_test_whatsapp_tariff_confirmation
  BEFORE UPDATE
  ON pg_temp.whatsapp_tariff_guard_test_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_whatsapp_tariff_confirmation();
CREATE TRIGGER tr_test_sanitize_portal_request
  BEFORE INSERT
  ON pg_temp.whatsapp_tariff_guard_test_rows
  FOR EACH ROW
  WHEN (NEW.source = 'hospital_portal')
  EXECUTE FUNCTION public.sanitize_authorization_request();
CREATE TRIGGER tr_test_enforce_whatsapp_authorization_security
  BEFORE INSERT
  ON pg_temp.whatsapp_tariff_guard_test_rows
  FOR EACH ROW
  WHEN (NEW.id = 21)
  EXECUTE FUNCTION public.enforce_whatsapp_authorization_security();
CREATE TRIGGER zz_test_prevent_finalized_whatsapp_insert
  BEFORE INSERT
  ON pg_temp.whatsapp_tariff_guard_test_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_finalized_whatsapp_insert();
CREATE TRIGGER b_test_require_approved_referral_before_acceptance
  BEFORE UPDATE OF status
  ON pg_temp.whatsapp_tariff_guard_test_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.require_approved_referral_before_acceptance();
CREATE TRIGGER tr_test_enforce_referral_state_transitions
  BEFORE UPDATE
  ON pg_temp.whatsapp_tariff_guard_test_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_referral_state_transitions();

-- A local sentinel lets the inactive-tariff cases run against any catalog.
-- The enclosing transaction is rolled back at the end of this test file.
INSERT INTO public.nhia_items (code, name, category, amount, is_active)
VALUES ('__WHATSAPP_GUARD_INACTIVE_TEST__', 'WhatsApp guard test item', 'test', 0, false)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    category = EXCLUDED.category,
    amount = EXCLUDED.amount,
    is_active = false;

INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows
  (id, source, status, approved_items, whatsapp_message_id, whatsapp_raw_message, referred_hospital_id)
VALUES
  (1, 'whatsapp', 'pending', '[]'::jsonb, NULL, NULL, NULL),
  (2, 'whatsapp', 'pending', '[]'::jsonb, NULL, NULL, NULL),
  (3, 'hospital_portal', 'pending_referral', '[]'::jsonb, NULL, NULL, gen_random_uuid()),
  (4, 'whatsapp', 'pending', '[]'::jsonb, NULL, NULL, NULL),
  (5, 'whatsapp', 'pending', '[]'::jsonb, NULL, NULL, NULL),
  (6, 'whatsapp', 'pending', '[]'::jsonb, 'wamid-test-6', 'wamid-test-6', NULL),
  (7, 'whatsapp', 'pending', '[]'::jsonb, NULL, NULL, NULL),
  (13, 'whatsapp_parser', 'pending', '[]'::jsonb, NULL, NULL, NULL),
  (14, 'manual', 'pending', '[]'::jsonb, 'wamid-test-14', 'wamid-test-14', NULL),
  (17, 'hospital_portal', 'pending_referral', '[]'::jsonb, NULL, NULL, gen_random_uuid()),
  (20, 'whatsapp', 'pending', '[]'::jsonb, NULL, NULL, NULL);

SELECT extensions.lives_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET updated_at = now() WHERE id = 24$$,
  'a harmless metadata update does not strand a historical WhatsApp approval with no recoverable cart'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET diagnosis = 'Changed diagnosis' WHERE id = 24$$,
  'P0001',
  'WhatsApp approvals require at least one tariff item',
  'a material diagnosis edit on a legacy WhatsApp approval requires a valid tariff cart'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET treatment = 'Changed treatment' WHERE id = 24$$,
  'P0001',
  'WhatsApp approvals require at least one tariff item',
  'a material treatment edit on a legacy WhatsApp approval requires a valid tariff cart'
);

SELECT extensions.throws_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items, whatsapp_message_id, whatsapp_raw_message, patient_name, policy_number) VALUES (21, ' WhatsApp ', 'pending', '[]'::jsonb, '__WHATSAPP_GUARD_UNKNOWN_MESSAGE__', '__WHATSAPP_GUARD_UNKNOWN_MESSAGE__', 'Test Patient', 'TEST-POLICY')$$,
  'P0001',
  'WhatsApp authorization rejected: whatsapp_message_not_found',
  'a padded WhatsApp source is canonicalized and must resolve to a durable inbound message'
);

SELECT extensions.throws_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items, whatsapp_message_id, whatsapp_raw_message) VALUES (22, 'whatsapp', 'pending', '[]'::jsonb, 'wamid-one', 'wamid-two')$$,
  'P0001',
  'WhatsApp authorization message identifiers must match',
  'the request identity and provenance message identity cannot diverge'
);

SELECT extensions.throws_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (23, ' WhatsApp ', 'approved', '[]'::jsonb)$$,
  'P0001',
  'WhatsApp authorizations must be inserted pending and finalized through an approval update',
  'a padded source cannot bypass the finalized-insert tariff guard'
);

SELECT extensions.throws_ok(
  $$SELECT public.validate_whatsapp_approval_items('[]'::jsonb)$$,
  'P0001',
  'WhatsApp approvals require at least one tariff item',
  'an empty tariff cart cannot be approved'
);

SELECT extensions.throws_ok(
  $$SELECT public.validate_whatsapp_approval_items('{}'::jsonb)$$,
  'P0001',
  'WhatsApp approvals require at least one tariff item',
  'a non-array tariff cart cannot be approved'
);

SELECT extensions.throws_ok(
  $$SELECT public.validate_whatsapp_approval_items('[{"name":"Unmapped service"}]'::jsonb)$$,
  'P0001',
  'WhatsApp approval items require a non-empty tariff code',
  'a treatment without a selected tariff code is held'
);

SELECT extensions.throws_ok(
  $$SELECT public.validate_whatsapp_approval_items('[{"code":"__WHATSAPP_TEST_UNKNOWN__","declined":false}]'::jsonb)$$,
  'P0001',
  'WhatsApp approval items must match an NHIA tariff',
  'an unsupported tariff code cannot be approved'
);

SELECT extensions.throws_ok(
  $$SELECT public.validate_whatsapp_approval_items('[{"code":"__WHATSAPP_GUARD_INACTIVE_TEST__","declined":false}]'::jsonb)$$,
  'P0001',
  'Selected WhatsApp approval items must match an active NHIA tariff',
  'an inactive NHIA tariff cannot be approved'
);

SELECT extensions.throws_ok(
  $$SELECT public.validate_whatsapp_approval_items(jsonb_build_array(jsonb_build_object('code', (SELECT code FROM public.nhia_items WHERE is_active IS TRUE ORDER BY code LIMIT 1), 'declined', true)))$$,
  'P0001',
  'WhatsApp approval requires at least one selected tariff item',
  'a cart containing only declined items cannot be approved'
);

SELECT extensions.ok(
  EXISTS (SELECT 1 FROM public.nhia_items WHERE is_active IS TRUE),
  'the tariff catalog contains an active item for the valid-path case'
);

SELECT extensions.lives_ok(
  $$SELECT public.validate_whatsapp_approval_items(jsonb_build_array(jsonb_build_object('code', (SELECT code FROM public.nhia_items WHERE is_active IS TRUE ORDER BY code LIMIT 1), 'declined', false)))$$,
  'a confirmed active tariff item permits approval'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'approved' WHERE id = 1$$,
  'P0001',
  'WhatsApp approvals require at least one tariff item',
  'the update trigger blocks direct approval with an empty cart'
);

SELECT extensions.lives_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'approved', approved_items = jsonb_build_array(jsonb_build_object('code', (SELECT code FROM public.nhia_items WHERE is_active IS TRUE ORDER BY code LIMIT 1), 'declined', false)) WHERE id = 2$$,
  'the update trigger permits a WhatsApp approval with a confirmed active tariff'
);

SELECT extensions.lives_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'paid' WHERE id = 2$$,
  'a WhatsApp request may move to paid after a protected approval with its selected tariff'
);

UPDATE public.nhia_items
SET is_active = true
WHERE code = '__WHATSAPP_GUARD_INACTIVE_TEST__';

UPDATE pg_temp.whatsapp_tariff_guard_test_rows
SET status = 'approved',
    approved_items = '[{"code":"__WHATSAPP_GUARD_INACTIVE_TEST__","declined":false}]'::jsonb
WHERE id = 20;

UPDATE public.nhia_items
SET is_active = false
WHERE code = '__WHATSAPP_GUARD_INACTIVE_TEST__';

SELECT extensions.lives_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'paid' WHERE id = 20$$,
  'a later NHIA deactivation does not invalidate an approval already made with an active tariff'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'approved', approved_items = '[{"code":"__WHATSAPP_GUARD_INACTIVE_TEST__","declined":false}]'::jsonb WHERE id = 7$$,
  'P0001',
  'Selected WhatsApp approval items must match an active NHIA tariff',
  'the update trigger rejects an inactive tariff'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'referral_accepted', approved_items = jsonb_build_array(jsonb_build_object('code', (SELECT code FROM public.nhia_items WHERE is_active IS TRUE ORDER BY code LIMIT 1), 'declined', false)) WHERE id = 7$$,
  'P0001',
  'WhatsApp referral acceptance requires a prior approved referral',
  'a WhatsApp request cannot skip insurer referral approval and jump to hospital acceptance'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'paid', approved_items = jsonb_build_array(jsonb_build_object('code', (SELECT code FROM public.nhia_items WHERE is_active IS TRUE ORDER BY code LIMIT 1), 'declined', false)) WHERE id = 7$$,
  'P0001',
  'WhatsApp payment status requires a prior approved authorization',
  'a WhatsApp request cannot skip approval and jump directly to paid'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'authorization_approved', approved_items = jsonb_build_array(jsonb_build_object('code', (SELECT code FROM public.nhia_items WHERE is_active IS TRUE ORDER BY code LIMIT 1), 'declined', false)) WHERE id = 13$$,
  'P0001',
  'WhatsApp approvals must use a protected decision status',
  'the unprotected legacy authorization_approved status cannot bypass decision validation'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'approved' WHERE id = 13$$,
  'P0001',
  'WhatsApp approvals require at least one tariff item',
  'the update trigger recognizes the whatsapp_parser source alias'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'approved' WHERE id = 14$$,
  'P0001',
  'WhatsApp approvals require at least one tariff item',
  'the update trigger recognizes WhatsApp message identifiers even if source is mislabeled'
);

SELECT extensions.throws_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (8, 'whatsapp', 'approved', '[]'::jsonb)$$,
  'P0001',
  'WhatsApp authorizations must be inserted pending and finalized through an approval update',
  'the insert trigger blocks a WhatsApp row inserted directly as approved without a tariff'
);

SELECT extensions.throws_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (9, 'whatsapp', 'approved', jsonb_build_array(jsonb_build_object('code', (SELECT code FROM public.nhia_items WHERE is_active IS TRUE ORDER BY code LIMIT 1), 'declined', false)))$$,
  'P0001',
  'WhatsApp authorizations must be inserted pending and finalized through an approval update',
  'a valid tariff still cannot bypass the protected approval update by direct insert'
);

SELECT extensions.throws_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (10, 'whatsapp', 'authorization_approved', '[]'::jsonb)$$,
  'P0001',
  'WhatsApp authorizations must be inserted pending and finalized through an approval update',
  'the insert trigger covers the legacy authorization_approved terminal status'
);

SELECT extensions.throws_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (11, 'whatsapp', 'referral_accepted', '[]'::jsonb)$$,
  'P0001',
  'WhatsApp authorizations must be inserted pending and finalized through an approval update',
  'the insert trigger covers the hospital referral acceptance terminal status'
);

SELECT extensions.throws_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (16, 'whatsapp', 'paid', '[]'::jsonb)$$,
  'P0001',
  'WhatsApp authorizations must be inserted pending and finalized through an approval update',
  'the insert trigger blocks a WhatsApp row inserted directly as paid'
);

SELECT extensions.throws_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (18, 'whatsapp', 'rejected', '[]'::jsonb)$$,
  'P0001',
  'WhatsApp decisions must be finalized through an update',
  'a WhatsApp rejection cannot bypass the protected decision update through insert'
);

SELECT extensions.throws_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (19, 'whatsapp', 'referral_declined', '[]'::jsonb)$$,
  'P0001',
  'WhatsApp decisions must be finalized through an update',
  'a WhatsApp referral decline cannot bypass the protected decision update through insert'
);

SELECT extensions.lives_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (12, 'hospital_portal', 'approved', '[]'::jsonb)$$,
  'a hospital-portal request is normalized before the final-status insert guard runs'
);

SELECT extensions.is(
  (SELECT status FROM pg_temp.whatsapp_tariff_guard_test_rows WHERE id = 12),
  'pending'::text,
  'the hospital-portal sanitizer preserves the normal pending intake flow'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET source = 'manual' WHERE id = 12$$,
  'P0001',
  'The source and submitter of a hospital portal request cannot be changed',
  'a hospital cannot relabel its portal request after intake'
);

SELECT extensions.lives_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (15, 'manual', 'approved', '[]'::jsonb)$$,
  'a non-WhatsApp manual insert keeps its existing status behavior'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET whatsapp_raw_message = 'untrusted WhatsApp marker' WHERE id = 15$$,
  'P0001',
  'The source, identity, and provenance of a WhatsApp authorization request cannot be changed',
  'a client cannot attach WhatsApp provenance to an existing non-WhatsApp request'
);

SELECT extensions.lives_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'referral_approved' WHERE id = 3$$,
  'the non-WhatsApp referral can receive insurer referral approval without a tariff cart'
);

SELECT extensions.lives_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'referral_accepted' WHERE id = 3$$,
  'the hospital stage-two referral acceptance remains compatible'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'referral_accepted' WHERE id = 17$$,
  'P0001',
  'Referral acceptance requires a prior approved referral',
  'a hospital cannot skip insurer approval before stage-two acceptance'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET source = 'manual' WHERE id = 4$$,
  'P0001',
  'The source, identity, and provenance of a WhatsApp authorization request cannot be changed',
  'the update trigger prevents relabeling a WhatsApp request to bypass the guard'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET source = ' WhatsApp ' WHERE id = 3$$,
  'P0001',
  'The source, identity, and provenance of a WhatsApp authorization request cannot be changed',
  'the update trigger prevents relabeling a non-WhatsApp request into WhatsApp after insert'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET whatsapp_message_id = NULL, whatsapp_raw_message = NULL WHERE id = 6$$,
  'P0001',
  'The source, identity, and provenance of a WhatsApp authorization request cannot be changed',
  'the update trigger prevents clearing WhatsApp identity markers'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET submitted_by = gen_random_uuid(), request_id = 'forged-request-id' WHERE id = 4$$,
  'P0001',
  'The source, identity, and provenance of a WhatsApp authorization request cannot be changed',
  'the update trigger prevents replacing WhatsApp submitter and request identity'
);

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET patient_name = 'Different Patient' WHERE id = 4$$,
  'P0001',
  'The source, identity, and provenance of a WhatsApp authorization request cannot be changed',
  'a reviewer cannot change the beneficiary identity after WhatsApp validation'
);

-- Exercise the existing database authorization check alongside the tariff
-- safeguard. With no authenticated nurse/admin JWT, finalization must fail.
CREATE TRIGGER test_protect_authorization_decision_transition
  BEFORE UPDATE OF status
  ON pg_temp.whatsapp_tariff_guard_test_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_authorization_decision_transition();

SELECT extensions.throws_ok(
  $$UPDATE pg_temp.whatsapp_tariff_guard_test_rows SET status = 'approved', approved_items = jsonb_build_array(jsonb_build_object('code', (SELECT code FROM public.nhia_items WHERE is_active IS TRUE ORDER BY code LIMIT 1), 'declined', false)) WHERE id = 5$$,
  'P0001',
  'Only authorized clinical staff can finalize an authorization decision',
  'a valid tariff does not let an unauthenticated direct update finalize the request'
);

-- Exercise the same insert boundary under simulated PostgREST JWT claims.
-- The table is temporary, so these checks leave no application data behind.
CREATE TRIGGER a_test_derive_authorization_request_provenance
  BEFORE INSERT
  ON pg_temp.whatsapp_tariff_guard_test_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_authorization_request_provenance();

SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT extensions.lives_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (25, 'whatsapp_parser', 'pending', '[]'::jsonb)$$,
  'trusted server intake can create a WhatsApp parser request'
);
SELECT extensions.is(
  (SELECT source FROM pg_temp.whatsapp_tariff_guard_test_rows WHERE id = 25),
  'whatsapp_parser'::text,
  'trusted server intake preserves its server-selected source'
);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000025', true);
SELECT extensions.throws_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (26, 'whatsapp', 'pending', '[]'::jsonb)$$,
  'P0001',
  'Authorization requests must use the authenticated intake path',
  'an authenticated direct insert cannot claim WhatsApp provenance'
);
SELECT extensions.throws_ok(
  $$INSERT INTO pg_temp.whatsapp_tariff_guard_test_rows (id, source, status, approved_items) VALUES (27, 'manual', 'pending', '[]'::jsonb)$$,
  'P0001',
  'Authorization requests must use the authenticated intake path',
  'an authenticated direct insert cannot omit provenance markers to evade intake'
);

SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'authorization_requests'
      AND cmd IN ('INSERT', 'ALL')
      AND policyname IN (
        'Nurses can insert requests',
        'Nurses can manage requests',
        'Authenticated can insert requests',
        'Hospitals can create requests'
      )
  ),
  'legacy permissive staff and hospital insert policies are removed'
);

SELECT extensions.ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'authorization_requests'
      AND policyname = 'Hospitals can create pending requests'
      AND cmd = 'INSERT'
  ),
  'the ownership-scoped pending hospital portal insert policy remains'
);

SELECT extensions.ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'a_derive_authorization_request_provenance'
      AND tgrelid = 'public.authorization_requests'::regclass
      AND NOT tgisinternal
  ),
  'the database derives provenance before accepting authenticated inserts'
);

SELECT extensions.ok(
  (SELECT count(*) = 6
    FROM pg_trigger
    WHERE tgname IN (
        'a_canonicalize_whatsapp_authorization_source',
        'a_derive_authorization_request_provenance',
        'a_require_whatsapp_tariff_confirmation_insert',
        'a_require_whatsapp_tariff_confirmation_update',
        'zz_prevent_finalized_whatsapp_insert',
        'b_require_approved_referral_before_acceptance'
      )
      AND tgrelid = 'public.authorization_requests'::regclass
      AND NOT tgisinternal
  ),
  'insert and update tariff guards are installed on authorization_requests'
);

SELECT * FROM extensions.finish();
ROLLBACK;
