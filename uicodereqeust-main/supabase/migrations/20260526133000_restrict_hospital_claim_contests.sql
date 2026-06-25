BEGIN;

DROP POLICY IF EXISTS "Hospitals can contest audited claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can contest audited claims"
  ON public.hospital_claims
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND status IN ('partially_approved', 'rejected', 'declined', 'denied', 'adjusted')
    AND hospital_id IN (
      SELECT h.id
      FROM public.hospitals h
      WHERE h.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND status IN ('contested', 'under_contest')
    AND hospital_id IN (
      SELECT h.id
      FROM public.hospitals h
      WHERE h.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
