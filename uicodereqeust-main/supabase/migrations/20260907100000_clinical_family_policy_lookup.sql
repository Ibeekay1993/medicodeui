-- Shared family-policy lookup for authenticated clinical review clients.
-- The policy is decomposed by the canonical split_family_policy function; a
-- suffix is never used to select a beneficiary. Matching the base in both
-- directions supports registries storing either base or suffixed rows.
CREATE OR REPLACE FUNCTION public.resolve_nhis_family_members(_policy text)
RETURNS SETOF public.nhis_beneficiaries
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH resolved AS (
    SELECT base_policy
    FROM public.split_family_policy(_policy)
  )
  SELECT nb.*
  FROM public.nhis_beneficiaries nb
  CROSS JOIN resolved r
  WHERE (SELECT base_policy FROM public.split_family_policy(nb.policy_number)) =
    r.base_policy;
$$;

REVOKE ALL ON FUNCTION public.resolve_nhis_family_members(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_nhis_family_members(text) TO authenticated;
