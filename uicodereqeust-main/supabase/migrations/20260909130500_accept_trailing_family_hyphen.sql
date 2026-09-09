-- Treat a trailing family hyphen as an incomplete suffix for matching.
-- It may resolve only when the beneficiary name identifies the family member.
CREATE OR REPLACE FUNCTION public.split_family_policy(_policy text)
RETURNS TABLE (
  base_policy text,
  member_suffix text,
  is_family_policy boolean
)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN btrim(coalesce(_policy, '')) ~ '^[0-9]+-[0-9]+$'
        OR btrim(coalesce(_policy, '')) ~ '^[0-9]+-$'
        THEN split_part(btrim(_policy), '-', 1)
      ELSE btrim(coalesce(_policy, ''))
    END,
    CASE
      WHEN btrim(coalesce(_policy, '')) ~ '^[0-9]+-[0-9]+$'
        THEN split_part(btrim(_policy), '-', 2)
      ELSE NULL::text
    END,
    (
      btrim(coalesce(_policy, '')) ~ '^[0-9]+-[0-9]+$'
      OR btrim(coalesce(_policy, '')) ~ '^[0-9]+-$'
    );
$$;

REVOKE ALL ON FUNCTION public.split_family_policy(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.split_family_policy(text) TO service_role;
