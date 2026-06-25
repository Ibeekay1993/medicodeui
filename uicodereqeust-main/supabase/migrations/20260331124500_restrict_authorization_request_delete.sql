-- Restrict destructive deletes to pending requests only.
-- This enforces safety even if frontend checks are bypassed.

DROP POLICY IF EXISTS "Nurses can manage requests" ON public.authorization_requests;

DROP POLICY IF EXISTS "Nurses can read all requests" ON public.authorization_requests;
CREATE POLICY "Nurses can read all requests"
  ON public.authorization_requests
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Nurses can update requests" ON public.authorization_requests;
CREATE POLICY "Nurses can update requests"
  ON public.authorization_requests
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Nurses can insert requests" ON public.authorization_requests;
CREATE POLICY "Nurses can insert requests"
  ON public.authorization_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Nurses can delete pending requests only" ON public.authorization_requests;
CREATE POLICY "Nurses can delete pending requests only"
  ON public.authorization_requests
  FOR DELETE
  TO authenticated
  USING (
    (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'))
    AND lower(coalesce(status, 'pending')) = 'pending'
  );
