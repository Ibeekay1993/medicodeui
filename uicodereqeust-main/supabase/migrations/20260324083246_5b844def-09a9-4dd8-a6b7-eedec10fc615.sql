
-- Seed hospitals
INSERT INTO public.hospitals (name, code, email, phone, state, whatsapp_number, is_active)
VALUES 
  ('Lagoon Hospital', 'LAG001', 'portal@lagoonhospital.com', '+2348012345678', 'Lagos', '+2348012345678', true),
  ('St. Nicholas Hospital', 'STN001', 'portal@stnicholas.com', '+2348023456789', 'Lagos', '+2348023456789', true),
  ('City Clinic Ibadan', 'CCI001', 'portal@cityclinic.com', '+2348034567890', 'Oyo', '+2348034567890', true)
ON CONFLICT DO NOTHING;

-- Drop and recreate policies to avoid conflicts
DO $$ BEGIN
  -- user_roles
  DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
  DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
  -- authorization_requests  
  DROP POLICY IF EXISTS "Nurses can read all requests" ON public.authorization_requests;
  DROP POLICY IF EXISTS "Authenticated can insert requests" ON public.authorization_requests;
  DROP POLICY IF EXISTS "Nurses can update requests" ON public.authorization_requests;
  -- hospitals
  DROP POLICY IF EXISTS "Anyone can read active hospitals" ON public.hospitals;
  DROP POLICY IF EXISTS "Nurses can insert hospitals" ON public.hospitals;
  DROP POLICY IF EXISTS "Nurses can update hospitals" ON public.hospitals;
  -- patients
  DROP POLICY IF EXISTS "Nurses can read patients" ON public.patients;
  DROP POLICY IF EXISTS "Nurses can insert patients" ON public.patients;
  -- logs
  DROP POLICY IF EXISTS "Nurses can read logs" ON public.authorization_logs;
  DROP POLICY IF EXISTS "Authenticated can insert logs" ON public.authorization_logs;
END $$;

CREATE POLICY "Users can insert own role" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Nurses can read all requests" ON public.authorization_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin') OR submitted_by = auth.uid());

CREATE POLICY "Authenticated can insert requests" ON public.authorization_requests
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Nurses can update requests" ON public.authorization_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read active hospitals" ON public.hospitals
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Nurses can insert hospitals" ON public.hospitals
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Nurses can update hospitals" ON public.hospitals
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Nurses can read patients" ON public.patients
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Nurses can insert patients" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Nurses can read logs" ON public.authorization_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can insert logs" ON public.authorization_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Also allow anon to read hospitals for signup form
DROP POLICY IF EXISTS "Anon can read active hospitals" ON public.hospitals;
CREATE POLICY "Anon can read active hospitals" ON public.hospitals
  FOR SELECT TO anon USING (is_active = true);
