
-- Tighten the insert request policy to require submitted_by = auth.uid()
DROP POLICY IF EXISTS "Authenticated can insert requests" ON public.authorization_requests;
CREATE POLICY "Authenticated can insert requests" ON public.authorization_requests
  FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());

-- Tighten hospital update to nurses only
DROP POLICY IF EXISTS "Nurses can update hospitals" ON public.hospitals;
CREATE POLICY "Nurses can update hospitals" ON public.hospitals
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

-- Tighten log insert
DROP POLICY IF EXISTS "Authenticated can insert logs" ON public.authorization_logs;
CREATE POLICY "Authenticated can insert logs" ON public.authorization_logs
  FOR INSERT TO authenticated WITH CHECK (performed_by = auth.uid());
