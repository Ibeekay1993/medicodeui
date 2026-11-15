-- ============================================================================
-- Close the anonymous API surface
--
-- Verified against the committed migrations (audit, 2026-11-14), reachable with
-- the public anon key that ships in the front-end bundle:
--
--  * link_support_conversation_to_request(uuid, uuid) is SECURITY DEFINER with
--    no caller check. An unauthenticated caller could re-link any support
--    conversation to any authorization request and write that request's UUID and
--    authorization code into the conversation.
--  * run_learning_observation(interval) is unused by the app and lets an
--    unauthenticated caller insert rows into learning_events and
--    knowledge_candidates without limit.
--  * resolve_whatsapp_authorization_context(...) is only called by the
--    submit-authorization edge function (service role).
--  * generate_auth_code / generate_referral_code / generate_batch_reference /
--    get_referral_hospitals / is_admin are callable without a session.
--  * About 50 functions are executable by anon and 25 tables still carry
--    INSERT/UPDATE/DELETE grants for anon; row level security is the only
--    barrier.
--
-- The front end makes no anonymous table or RPC calls: every page reads data
-- after sign-in, and the registration page calls check_invite_status with the
-- invitee's own bearer token.
--
-- This migration does NOT touch create_payment_batch_transactional: the version
-- committed in 20261003190000 already checks the caller's role and locks rows.
-- Safe to re-run.
-- ============================================================================
BEGIN;

-- 1. Functions that only server code (service role) should call.
DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.resolve_whatsapp_authorization_context(text, text, text, text)',
    'public.run_learning_observation(interval)'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END IF;
  END LOOP;
END $$;

-- 2. No anonymous access to application functions. authenticated keeps exactly
--    what it has today (re-granted only where it already had access, so earlier
--    targeted REVOKEs from authenticated are not undone). Extension-owned
--    functions are skipped.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF r.auth_can THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $$;

-- 3. No anonymous table or sequence privileges.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

COMMIT;

-- ============================================================================
-- FOLLOW-UP (code change, not included here): inside
-- link_support_conversation_to_request add, before any UPDATE:
--   IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
--   and require that the caller is staff, or owns the conversation AND the
--   request belongs to the same hospital as the conversation.
--
-- VERIFICATION (read-only; both should return no rows)
--   SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prokind = 'f'
--     AND has_function_privilege('anon', p.oid, 'EXECUTE')
--     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r'
--     AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT'));
-- ============================================================================
