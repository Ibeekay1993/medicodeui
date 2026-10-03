-- Add critical performance indexes to stop statement timeouts on t4g.nano instance

-- 1. Index for main requests queue pagination: ORDER BY updated_at DESC LIMIT 50
CREATE INDEX IF NOT EXISTS idx_authorization_requests_updated_at_desc
  ON public.authorization_requests (updated_at DESC NULLS LAST);

-- 2. Text pattern indexes for policy prefix searches (LIKE '123%')
CREATE INDEX IF NOT EXISTS idx_authorization_requests_policy_pattern
  ON public.authorization_requests (policy_number text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_nhis_beneficiaries_policy_pattern
  ON public.nhis_beneficiaries (policy_number text_pattern_ops);

-- 3. Text pattern index for patient_name prefix search
CREATE INDEX IF NOT EXISTS idx_authorization_requests_patient_name_pattern
  ON public.authorization_requests (patient_name text_pattern_ops);

-- 4. Fast resolve_nhis_family_members using prefix pattern matching
CREATE OR REPLACE FUNCTION public.resolve_nhis_family_members(_policy text)
RETURNS SETOF public.nhis_beneficiaries
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
  SELECT nb.*
  FROM public.nhis_beneficiaries nb
  WHERE
    -- Exact match on full policy
    nb.policy_number = btrim(_policy)
    OR
    -- If policy has suffix like '1234567-1', match the base '1234567' or any family member '1234567-%'
    (
      split_part(btrim(_policy), '-', 1) <> ''
      AND (
        nb.policy_number = split_part(btrim(_policy), '-', 1)
        OR nb.policy_number LIKE (split_part(btrim(_policy), '-', 1) || '-%')
      )
    );
$func$;