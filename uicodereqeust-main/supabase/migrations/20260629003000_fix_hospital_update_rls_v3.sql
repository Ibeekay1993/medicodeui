-- Fix hospital UPDATE policy to properly use public.user_roles instead of public.hospitals
DROP POLICY IF EXISTS "Hospitals can update their own requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can update their own requests"
  ON public.authorization_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND EXISTS (
      SELECT 1 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
        AND ur.hospital_id IN (
          hospital_id,
          requesting_hospital_id,
          referring_hospital_id,
          referred_hospital_id,
          claiming_hospital_id
        )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND EXISTS (
      SELECT 1 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
        AND ur.hospital_id IN (
          hospital_id,
          requesting_hospital_id,
          referring_hospital_id,
          referred_hospital_id,
          claiming_hospital_id
        )
    )
  );
