-- Fix hospital UPDATE policy to use OR instead of AND between submitted_by and hospital_id

DROP POLICY IF EXISTS "Hospitals can update their own requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can update their own requests"
  ON public.authorization_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND (
      submitted_by = auth.uid()
      OR hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND (
      submitted_by = auth.uid()
      OR hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    )
  );
