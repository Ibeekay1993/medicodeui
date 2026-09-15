-- Keep family-policy resolution exact while avoiding a function call for every
-- beneficiary row. The previous resolver evaluated split_family_policy on the
-- whole table, which could hit the database statement timeout after a refresh.
CREATE OR REPLACE FUNCTION public.resolve_nhis_family_members(_policy text)
RETURNS SETOF public.nhis_beneficiaries
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH input AS (
    SELECT
      btrim(coalesce(_policy, '')) AS submitted_policy,
      CASE
        WHEN btrim(coalesce(_policy, '')) ~ '^[0-9]+-[0-9]+$'
          THEN split_part(btrim(_policy), '-', 1)
        ELSE btrim(coalesce(_policy, ''))
      END AS base_policy
  )
  SELECT nb.*
  FROM public.nhis_beneficiaries nb
  CROSS JOIN input i
  WHERE btrim(coalesce(nb.policy_number, '')) = i.submitted_policy
     OR btrim(coalesce(nb.policy_number, '')) = i.base_policy
     OR (
       i.base_policy <> ''
       AND btrim(coalesce(nb.policy_number, '')) LIKE i.base_policy || '-%'
     );
$$;

REVOKE ALL ON FUNCTION public.resolve_nhis_family_members(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_nhis_family_members(text) TO authenticated;
