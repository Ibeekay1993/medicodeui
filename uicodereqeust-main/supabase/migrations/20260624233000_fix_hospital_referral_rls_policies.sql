BEGIN;

-- ─────────────────────────────────────────────────────────
-- 1. Fix public.authorization_requests SELECT policy
-- ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Hospitals can view their own requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can view their own requests"
  ON public.authorization_requests
  FOR SELECT
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
  );

-- ─────────────────────────────────────────────────────────
-- 2. Fix public.authorization_requests UPDATE policy
-- ─────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────
-- 3. Fix public.hospital_claims INSERT policy
-- ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Hospitals can create own claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can create own claims"
  ON public.hospital_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND created_by = auth.uid()
    AND status = 'draft'
    AND hospital_id IN (
      SELECT ur.hospital_id 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
    )
    AND hospital_name = (
      SELECT h.name
      FROM public.hospitals h
      WHERE h.id = hospital_id
    )
    AND request_id IN (
      SELECT ar.id
      FROM public.authorization_requests ar
      WHERE ar.status = 'approved'
        AND COALESCE(ar.referred_hospital_id, ar.claiming_hospital_id, ar.hospital_id) IN (
          SELECT ur.hospital_id 
          FROM public.user_roles ur 
          WHERE ur.user_id = auth.uid() 
            AND ur.role = 'hospital'
        )
    )
  );

COMMIT;
