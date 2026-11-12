-- Disabled legacy demo seed. It created fixed administrator and staff accounts
-- using the public password `demo1234`, so this file must never provision users.
--
-- For disposable non-production environments, use:
--   node scripts/setup-demo-users.mjs
-- with ALLOW_DEMO_USER_SETUP=true, SUPABASE_ENVIRONMENT=development|test|staging,
-- and a unique DEMO_USER_PASSWORD of at least 16 characters. The script refuses
-- production Supabase endpoints and uses example.invalid addresses.
DO $$
BEGIN
  RAISE EXCEPTION 'Legacy demo account seeding is disabled. Use scripts/setup-demo-users.mjs only in an isolated non-production environment.';
END;
$$;
