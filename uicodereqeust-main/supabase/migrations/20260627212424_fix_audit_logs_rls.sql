-- Fix the broken RLS policy for audit logs
-- Restrict read access STRICTLY to admins only
DROP POLICY IF EXISTS "Staff can read audit logs" ON public.audit_logs;

CREATE POLICY "Admins alone can read audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );
