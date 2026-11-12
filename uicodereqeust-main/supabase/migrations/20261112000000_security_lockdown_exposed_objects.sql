-- ============================================================================
-- Security lockdown: objects reachable through the public API that should not be
-- (found in security audit, 2026-11-11)
--
-- Safe to re-run. Every statement skips objects that do not exist.
-- Review sections 1-3 against your live database before applying (see the
-- verification queries at the bottom).
-- ============================================================================
BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Internal SECURITY DEFINER helpers that any caller could execute.
--    None are called by the frontend or by edge functions. The only callers
--    are other SECURITY DEFINER functions, triggers and pg_cron, which run as
--    the owner and keep working after this REVOKE.
--
--    transfer_referral              no role/ownership check; changes referral state
--    request_support_ticket_metadata returns patient name, policy no., diagnosis,
--                                    treatment and clinical notes for any request id
--    claims_volume_performance      claims financial aggregates, no role check
--    reconcile_historical_code      lookup oracle for auth/claim/hospital ids
--    find_support_assignee          returns staff user ids
--    cleanup_whatsapp_queue         deletes queue rows and processing logs
--    close_inactive_support_conversations, backfill_user_role_ids  maintenance
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.transfer_referral(uuid)',
    'public.request_support_ticket_metadata(uuid)',
    'public.claims_volume_performance(timestamptz, timestamptz, text)',
    'public.reconcile_historical_code(jsonb)',
    'public.find_support_assignee(text)',
    'public.cleanup_whatsapp_queue()',
    'public.close_inactive_support_conversations()',
    'public.backfill_user_role_ids()'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    END IF;
  END LOOP;
END $$;

-- Missing SET search_path on SECURITY DEFINER functions (search-path hijack).
DO $$
DECLARE
  sig text;
  sigs text[] := ARRAY[
    'public.transfer_referral(uuid)',
    'public.generate_batch_reference()',
    'public.cleanup_whatsapp_queue()',
    'public.create_audit_log(text, jsonb)'
  ];
BEGIN
  FOREACH sig IN ARRAY sigs LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public', sig);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Tables created after the one-off 2026-05-16 "REVOKE ... FROM anon" never
--    had RLS enabled. whatsapp_outbound_ledger holds destination phone numbers.
--    Only server-side code (service_role, which bypasses RLS) uses these.
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_outbound_ledger', 'referral_code_sequence'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. payment-receipts bucket
--    Created with public = true, so receipt files are downloadable by URL with
--    no login, no expiry and no revocation. The app already reads receipts via
--    signed URLs, so making the bucket private does not change app behaviour.
--    The broad "any authenticated user can view" policy is removed; the
--    existing "Admins and Finance can manage receipts" policy still applies.
--    If hospitals must view their own receipts, add a scoped policy instead.
-- ----------------------------------------------------------------------------
UPDATE storage.buckets
SET public = false
WHERE id = 'payment-receipts';

DROP POLICY IF EXISTS "Authenticated users can view receipts" ON storage.objects;

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf']
WHERE id = 'payment-receipts';

-- ----------------------------------------------------------------------------
-- 4. Stop the problem recurring: new functions and tables created by the
--    migration role no longer get open grants by default. Future migrations must
--    GRANT explicitly. (Existing objects are not changed by this.)
-- ----------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

COMMIT;

-- ============================================================================
-- VERIFICATION (run manually; read-only)
-- ============================================================================

-- A. Functions in public that anon can still execute. Review every row.
--    SELECT p.oid::regprocedure AS fn, p.prosecdef AS security_definer
--    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.prokind = 'f'
--      AND has_function_privilege('anon', p.oid, 'EXECUTE')
--    ORDER BY p.prosecdef DESC, 1;

-- B. Tables in public with RLS off, or readable by anon.
--    SELECT c.relname, c.relrowsecurity AS rls_on,
--           has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select
--    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relkind = 'r'
--      AND (NOT c.relrowsecurity OR has_table_privilege('anon', c.oid, 'SELECT'))
--    ORDER BY 1;

-- C. Demo accounts from supabase/seed_demo_accounts.sql (admin, password demo1234).
--    If any row returns on production, disable or delete them immediately and
--    rotate any data they could reach.
--    SELECT id, email, last_sign_in_at FROM auth.users
--    WHERE email ILIKE 'demo.%';
