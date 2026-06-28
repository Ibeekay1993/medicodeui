-- Fix hospital UPDATE policy to properly check all hospital-related columns
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
      OR referred_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
      OR claiming_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
      OR requesting_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
      OR referring_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND (
      submitted_by = auth.uid()
      OR hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
      OR referred_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
      OR claiming_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
      OR requesting_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
      OR referring_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    )
  );
