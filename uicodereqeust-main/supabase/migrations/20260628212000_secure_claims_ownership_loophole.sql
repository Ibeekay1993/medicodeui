-- =========================================================================================
-- Migration: Secure Claims Ownership Loophole
-- Purpose:
-- 1. Fixes the `Hospitals can create own claims` policy to enforce that the hospital
--    submitting the claim is the legally assigned `claiming_hospital_id` or `referred_hospital_id`,
--    preventing referring hospitals from stealing payments.
-- 2. Adds a trigger to `authorization_requests` preventing hospitals from altering core
--    ownership fields (`hospital_id`, `claiming_hospital_id`, etc.) via direct UPDATE.
-- =========================================================================================

BEGIN;

-- 1. Re-secure Claim Creation Policy
DROP POLICY IF EXISTS "Hospitals can create own claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can create own claims"
  ON public.hospital_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND created_by = auth.uid()
    AND status = 'draft'
    AND hospital_id::uuid IN (
      SELECT ur.hospital_id::uuid 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() AND ur.role = 'hospital'
    )
    AND EXISTS (
      SELECT 1 FROM public.authorization_requests ar
      WHERE ar.id::uuid = request_id::uuid
        AND lower(ar.status) = 'approved'
        AND ar.authorization_code::text = auth_code::text
        -- SECURE THE CLAIM OWNER
        AND COALESCE(ar.referred_hospital_id, ar.claiming_hospital_id, ar.hospital_id)::uuid = hospital_id::uuid
    )
  );

-- 2. Protect Authorization Request Ownership Fields
CREATE OR REPLACE FUNCTION public.protect_authorization_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If the user is a hospital, they cannot modify ownership fields
  IF public.has_role(auth.uid(), 'hospital') THEN
    IF NEW.hospital_id IS DISTINCT FROM OLD.hospital_id THEN
      RAISE EXCEPTION 'Hospitals are not allowed to change the hospital_id of an authorization request.';
    END IF;
    IF NEW.requesting_hospital_id IS DISTINCT FROM OLD.requesting_hospital_id THEN
      RAISE EXCEPTION 'Hospitals are not allowed to change the requesting_hospital_id of an authorization request.';
    END IF;
    IF NEW.referring_hospital_id IS DISTINCT FROM OLD.referring_hospital_id THEN
      RAISE EXCEPTION 'Hospitals are not allowed to change the referring_hospital_id of an authorization request.';
    END IF;
    IF NEW.referred_hospital_id IS DISTINCT FROM OLD.referred_hospital_id THEN
      RAISE EXCEPTION 'Hospitals are not allowed to change the referred_hospital_id of an authorization request.';
    END IF;
    IF NEW.claiming_hospital_id IS DISTINCT FROM OLD.claiming_hospital_id THEN
      RAISE EXCEPTION 'Hospitals are not allowed to change the claiming_hospital_id of an authorization request.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_protect_authorization_ownership ON public.authorization_requests;
CREATE TRIGGER tr_protect_authorization_ownership
  BEFORE UPDATE ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_authorization_ownership();

COMMIT;
