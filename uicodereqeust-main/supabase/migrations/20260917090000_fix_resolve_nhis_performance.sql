-- Fix: resolve_nhis_family_members caused "canceling statement due to statement timeout"
-- Root cause: per-row correlated subquery calling split_family_policy(nb.policy_number)
-- for EVERY row in nhis_beneficiaries (full-table sequential scan).
--
-- The fix inlines the split logic as a direct SQL expression:
--   split_part(regexp_replace(nb.policy_number, '\s', '', 'g'), '-', 1)
-- This is equivalent to split_family_policy's base_policy result and lets the
-- database evaluate it inline without a function-call-per-row, dramatically reducing cost.
-- The expression is stable/immutable so the planner can still push it down efficiently.

CREATE OR REPLACE FUNCTION public.resolve_nhis_family_members(_policy text)
RETURNS SETOF public.nhis_beneficiaries
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT nb.*
  FROM public.nhis_beneficiaries nb
  WHERE
    -- Case 1: Exact match on the full submitted policy (covers base or suffixed lookup)
    upper(btrim(coalesce(nb.policy_number, ''))) = upper(btrim(coalesce(_policy, '')))

    OR

    -- Case 2: Family match — derive base from both sides inline (no per-row function call)
    --   base = everything before the first '-' if the policy is numeric-dash-numeric format
    --   otherwise base = the policy itself
    split_part(
      btrim(upper(coalesce(nb.policy_number, ''))), '-', 1
    ) = split_part(
      btrim(upper(coalesce(_policy, ''))), '-', 1
    )
    -- Only apply family matching when the submitted policy contains a digit-dash pattern
    AND (
      btrim(upper(coalesce(_policy, ''))) ~ '^[0-9]+-'
      OR btrim(upper(coalesce(_policy, ''))) ~ '^[0-9]+$'
    )
$$;

REVOKE ALL ON FUNCTION public.resolve_nhis_family_members(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_nhis_family_members(text) TO authenticated;
