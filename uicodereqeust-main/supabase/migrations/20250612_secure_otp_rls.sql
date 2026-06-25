-- Security: Lock down otp_verifications table
-- Only service_role (Edge Functions) should access this table.
-- All anon/authenticated access is blocked by default-deny RLS.

-- 1. Enable RLS (should already be enabled)
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing permissive policies that allow anon/authenticated access
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'otp_verifications'
      AND roles != '{service_role}'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.otp_verifications', pol.policyname);
  END LOOP;
END $$;

-- 3. Create explicit deny policies for anon and authenticated roles
-- (Service role bypasses RLS by default, so no policy needed for it)

-- Deny SELECT for anon
CREATE POLICY "otp_verifications_select_deny_anon"
  ON public.otp_verifications
  FOR SELECT
  TO anon
  USING (false);

-- Deny INSERT for anon
CREATE POLICY "otp_verifications_insert_deny_anon"
  ON public.otp_verifications
  FOR INSERT
  TO anon
  WITH CHECK (false);

-- Deny UPDATE for anon
CREATE POLICY "otp_verifications_update_deny_anon"
  ON public.otp_verifications
  FOR UPDATE
  TO anon
  USING (false);

-- Deny DELETE for anon
CREATE POLICY "otp_verifications_delete_deny_anon"
  ON public.otp_verifications
  FOR DELETE
  TO anon
  USING (false);

-- Deny SELECT for authenticated
CREATE POLICY "otp_verifications_select_deny_authenticated"
  ON public.otp_verifications
  FOR SELECT
  TO authenticated
  USING (false);

-- Deny INSERT for authenticated
CREATE POLICY "otp_verifications_insert_deny_authenticated"
  ON public.otp_verifications
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Deny UPDATE for authenticated
CREATE POLICY "otp_verifications_update_deny_authenticated"
  ON public.otp_verifications
  FOR UPDATE
  TO authenticated
  USING (false);

-- Deny DELETE for authenticated
CREATE POLICY "otp_verifications_delete_deny_authenticated"
  ON public.otp_verifications
  FOR DELETE
  TO authenticated
  USING (false);

-- 4. Also secure email_logs table (contains OTP metadata)
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_logs'
      AND roles != '{service_role}'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.email_logs', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "email_logs_select_deny_anon" ON public.email_logs FOR SELECT TO anon USING (false);
CREATE POLICY "email_logs_insert_deny_anon" ON public.email_logs FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY "email_logs_select_deny_authenticated" ON public.email_logs FOR SELECT TO authenticated USING (false);
CREATE POLICY "email_logs_insert_deny_authenticated" ON public.email_logs FOR INSERT TO authenticated WITH CHECK (false);

-- 5. Secure audit_logs table
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND roles != '{service_role}'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.audit_logs', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "audit_logs_select_deny_anon" ON public.audit_logs FOR SELECT TO anon USING (false);
CREATE POLICY "audit_logs_insert_deny_anon" ON public.audit_logs FOR INSERT TO anon WITH CHECK (false);
CREATE POLICY "audit_logs_select_deny_authenticated" ON public.audit_logs FOR SELECT TO authenticated USING (false);
CREATE POLICY "audit_logs_insert_deny_authenticated" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (false);
