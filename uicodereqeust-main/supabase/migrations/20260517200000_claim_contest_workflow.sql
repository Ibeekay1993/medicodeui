ALTER TABLE public.hospital_claims
  ADD COLUMN IF NOT EXISTS under_contest_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contest_note TEXT,
  ADD COLUMN IF NOT EXISTS contest_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contest_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contest_resolved_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "Claims can update hospital claims" ON public.hospital_claims;
CREATE POLICY "Claims can update hospital claims"
  ON public.hospital_claims
  FOR UPDATE
  TO authenticated
  USING (
    (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin'))
    AND status IN ('submitted', 'pending', 'under_review', 'approved', 'partially_approved', 'rejected', 'contested', 'under_contest')
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin'))
    AND status IN ('submitted', 'pending', 'under_review', 'approved', 'partially_approved', 'rejected', 'paid', 'contested', 'under_contest')
  );

DROP POLICY IF EXISTS "Hospitals can contest audited claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can contest audited claims"
  ON public.hospital_claims
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND status IN ('approved', 'partially_approved', 'rejected')
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND status IN ('contested', 'under_contest')
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
  );

NOTIFY pgrst, 'reload schema';
