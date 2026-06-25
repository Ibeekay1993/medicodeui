
-- Fix 1: Move extensions to schema 'extensions'
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION "uuid-ossp" SET SCHEMA extensions;
ALTER EXTENSION "pg_trgm" SET SCHEMA extensions;

-- Fix 2: auth_code_sequence has RLS but no policy — add restrictive policy
CREATE POLICY "No direct access to auth_code_sequence"
  ON public.auth_code_sequence FOR SELECT
  TO authenticated
  USING (false);

-- Fix 3: Fix the overly permissive INSERT policy on authorization_logs
DROP POLICY "System can insert logs" ON public.authorization_logs;
CREATE POLICY "Authenticated users can insert logs"
  ON public.authorization_logs FOR INSERT
  TO authenticated
  WITH CHECK (performed_by = auth.uid());

-- Fix patient name index to use extensions schema for pg_trgm
DROP INDEX IF EXISTS idx_patients_name;
CREATE INDEX idx_patients_name ON public.patients USING gin ((surname || ' ' || first_name) extensions.gin_trgm_ops);
