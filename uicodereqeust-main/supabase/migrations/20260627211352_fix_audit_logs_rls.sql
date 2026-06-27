-- Fix the broken RLS policy for audit logs which was failing due to 'nurse' role changes
DROP POLICY IF EXISTS "Staff can read audit logs" ON public.audit_logs;

CREATE POLICY "Staff can read audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'claims', 'utilization_manager', 'hospital')
    )
  );
