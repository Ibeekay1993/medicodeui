-- Migration: 20261005140000_fast_clinical_history_lookup.sql
-- Optimizes clinical authorization history lookup for Nano/Free-tier Supabase.
-- 1. Creates text_pattern_ops index on policy_number for instant prefix/exact lookups.
-- 2. Creates an indexed RPC that retains the caller's authorization_requests RLS rules.

BEGIN;

-- 1. Fast pattern index for LIKE queries (e.g. '2871167-%')
CREATE INDEX IF NOT EXISTS idx_authorization_requests_policy_pattern
  ON public.authorization_requests (policy_number text_pattern_ops);

-- Index on beneficiary_number for direct member lookups
CREATE INDEX IF NOT EXISTS idx_authorization_requests_beneficiary_number
  ON public.authorization_requests (beneficiary_number)
  WHERE beneficiary_number IS NOT NULL;

-- 2. Fast, authenticated RPC for clinical history lookup
CREATE OR REPLACE FUNCTION public.get_patient_authorization_history(
  p_policy_number text,
  p_policy_root text DEFAULT NULL,
  p_beneficiary_number text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  request_id text,
  patient_name text,
  policy_number text,
  beneficiary_number text,
  diagnosis text,
  treatment text,
  hospital_name text,
  status text,
  authorization_code text,
  decision_reason text,
  clinical_notes text,
  decided_at timestamptz,
  created_at timestamptz,
  source text,
  is_historical boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Security check: caller must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Clean inputs
  p_policy_number := NULLIF(TRIM(p_policy_number), '');
  p_policy_root := NULLIF(TRIM(p_policy_root), '');
  p_beneficiary_number := NULLIF(TRIM(p_beneficiary_number), '');

  IF p_policy_number IS NULL AND p_policy_root IS NULL AND p_beneficiary_number IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    ar.id,
    ar.request_id,
    ar.patient_name,
    ar.policy_number,
    ar.beneficiary_number,
    ar.diagnosis,
    ar.treatment,
    ar.hospital_name,
    ar.status::text,
    ar.authorization_code,
    ar.decision_reason,
    ar.clinical_notes,
    ar.decided_at,
    ar.created_at,
    ar.source,
    ar.is_historical
  FROM public.authorization_requests ar
  WHERE (
    (p_policy_number IS NOT NULL AND ar.policy_number = p_policy_number)
    OR (p_policy_root IS NOT NULL AND (ar.policy_number = p_policy_root OR ar.policy_number LIKE p_policy_root || '-%'))
    OR (p_beneficiary_number IS NOT NULL AND ar.beneficiary_number = p_beneficiary_number)
  )
  AND auth.uid() IS NOT NULL
  ORDER BY ar.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 100), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.get_patient_authorization_history(text, text, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_authorization_history(text, text, text, integer) TO authenticated;

COMMIT;
