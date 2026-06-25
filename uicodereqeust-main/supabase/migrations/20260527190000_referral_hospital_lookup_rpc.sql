-- Allow authenticated users to search active hospitals for referral selection
-- without exposing the full hospitals table columns through broad SELECT RLS.

CREATE OR REPLACE FUNCTION public.get_referral_hospitals()
RETURNS TABLE (
  id uuid,
  name text,
  code text,
  state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id, h.name, h.code, h.state
  FROM public.hospitals h
  WHERE h.is_active = true
  ORDER BY h.name ASC;
$$;

REVOKE ALL ON FUNCTION public.get_referral_hospitals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_referral_hospitals() TO authenticated;
