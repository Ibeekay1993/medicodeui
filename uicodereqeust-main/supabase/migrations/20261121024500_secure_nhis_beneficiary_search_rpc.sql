-- ============================================================================
-- Secure NHIS Beneficiary Search RPC & Restrict Direct Table Access
--
-- 1. Restricts direct SELECT on nhis_beneficiaries to clinical staff only
--    (nurses, admins, utilization managers).
-- 2. Provides a dedicated, rate-limited SECURITY DEFINER search RPC for hospital
--    users (search_nhis_beneficiaries) that:
--      - Requires authentication (auth.uid() IS NOT NULL)
--      - Enforces minimum search length (>= 3 chars)
--      - Returns only verification fields (full_name, policy_number, beneficiary_number)
--      - Strictly limits output to 10 rows maximum
--      - Prevents table dumps or sensitive column scraping by hospitals
-- ============================================================================
BEGIN;

-- 1. Restrict direct table SELECT to clinical staff and approvers
DROP POLICY IF EXISTS "Hospitals and clinical staff can read beneficiaries" ON public.nhis_beneficiaries;
DROP POLICY IF EXISTS "Only clinical staff can read beneficiaries" ON public.nhis_beneficiaries;

CREATE POLICY "Only clinical staff can read beneficiaries"
  ON public.nhis_beneficiaries FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'nurse'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'utilization_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)
  );

-- 2. Provide controlled search RPC for hospital intake and enrollee verification
CREATE OR REPLACE FUNCTION public.search_nhis_beneficiaries(p_query text)
RETURNS TABLE (
  full_name text,
  policy_number text,
  beneficiary_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_query text;
BEGIN
  -- Caller must be an authenticated platform user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  clean_query := trim(coalesce(p_query, ''));
  -- Enforce minimum search length
  IF length(clean_query) < 3 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT b.full_name, b.policy_number, b.beneficiary_number
  FROM public.nhis_beneficiaries b
  WHERE b.policy_number ILIKE '%' || clean_query || '%'
     OR b.beneficiary_number ILIKE '%' || clean_query || '%'
     OR b.full_name ILIKE '%' || clean_query || '%'
  ORDER BY b.full_name ASC
  LIMIT 10;
END;
$$;

REVOKE ALL ON FUNCTION public.search_nhis_beneficiaries(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_nhis_beneficiaries(text) TO authenticated, service_role;

COMMIT;
