BEGIN;

-- Create temporary normalization function for the migration
CREATE OR REPLACE FUNCTION public.temp_normalize_name(val TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN REGEXP_REPLACE(LOWER(TRIM(COALESCE(val, ''))), '[^a-z0-9]+', ' ', 'g');
END;
$$;

-- Update the authorization requests by matching against the hospitals table
UPDATE public.authorization_requests req
SET
  referred_hospital_id = h.id,
  claiming_hospital_id = COALESCE(req.claiming_hospital_id, h.id)
FROM public.hospitals h
WHERE req.referred_hospital_id IS NULL
  AND req.referred_hospital_name IS NOT NULL
  AND (
    -- Exact normalized match
    public.temp_normalize_name(req.referred_hospital_name) = public.temp_normalize_name(h.name)
    OR
    -- UCH special cases
    (
      (public.temp_normalize_name(req.referred_hospital_name) IN ('uch', 'university college hospital', 'university college hospital ibadan'))
      AND 
      (public.temp_normalize_name(h.name) IN ('uch', 'university college hospital', 'university college hospital ibadan'))
    )
    OR
    -- University Health Services (Jaja Clinic) special cases
    (
      (public.temp_normalize_name(req.referred_hospital_name) IN ('university of ibadan health services', 'jaja clinic', 'jaja health clinic', 'university health services'))
      AND 
      (public.temp_normalize_name(h.name) IN ('university of ibadan health services', 'jaja clinic', 'jaja health clinic', 'university health services'))
    )
    OR
    -- Partial containing match
    public.temp_normalize_name(h.name) LIKE '%' || public.temp_normalize_name(req.referred_hospital_name) || '%'
  );

-- Perform the second pass backfill of requesting, referring, and claiming IDs
-- which may now be possible because referred_hospital_id has been resolved
UPDATE public.authorization_requests
SET
  claiming_hospital_id   = COALESCE(claiming_hospital_id,   referred_hospital_id),
  claiming_hospital_name = COALESCE(claiming_hospital_name, referred_hospital_name),
  requesting_hospital_id   = COALESCE(requesting_hospital_id,   hospital_id),
  requesting_hospital_name = COALESCE(requesting_hospital_name, hospital_name),
  referring_hospital_id    = COALESCE(referring_hospital_id,    hospital_id),
  referring_hospital_name  = COALESCE(referring_hospital_name,  hospital_name),
  updated_at = now()
WHERE
  status IN ('pending_referral', 'referral_approved', 'referral_accepted')
  AND referred_hospital_id IS NOT NULL
  AND (
    claiming_hospital_id IS NULL
    OR requesting_hospital_id IS NULL
    OR referring_hospital_id IS NULL
  );

-- Clean up temporary function
DROP FUNCTION IF EXISTS public.temp_normalize_name(TEXT);

COMMIT;
