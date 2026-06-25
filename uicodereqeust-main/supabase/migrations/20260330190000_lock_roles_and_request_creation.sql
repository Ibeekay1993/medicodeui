-- Security hardening:
-- 1) Prevent users from inserting their own role rows.
-- 2) Restrict request creation to authenticated hospitals creating pending requests only.

DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated can insert requests" ON public.authorization_requests;

CREATE POLICY "Admins can manage user roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Hospitals can create pending requests"
  ON public.authorization_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND submitted_by = auth.uid()
    AND status = 'pending'
    AND (authorization_code IS NULL OR authorization_code = '')
  );
