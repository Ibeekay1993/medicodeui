
CREATE TABLE public.nhis_beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_number text NOT NULL,
  member_type text NOT NULL,
  surname text NOT NULL,
  first_name text NOT NULL,
  full_name text NOT NULL,
  gender text,
  dob text,
  plan_code text,
  hcp_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nhis_policy ON public.nhis_beneficiaries(policy_number);
CREATE INDEX idx_nhis_fullname ON public.nhis_beneficiaries(full_name);
CREATE INDEX idx_nhis_surname ON public.nhis_beneficiaries(surname);

ALTER TABLE public.nhis_beneficiaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read beneficiaries"
  ON public.nhis_beneficiaries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Nurses can manage beneficiaries"
  ON public.nhis_beneficiaries FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'nurse') OR has_role(auth.uid(), 'admin'));
