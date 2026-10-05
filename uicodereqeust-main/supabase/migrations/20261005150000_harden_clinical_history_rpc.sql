-- Keep the clinical-history RPC within the same authorization boundary as a
-- direct SELECT. SECURITY DEFINER here would bypass authorization_requests RLS.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_authorization_requests_policy_pattern
  ON public.authorization_requests (policy_number text_pattern_ops);

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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
  FROM public.authorization_requests AS ar
  WHERE auth.uid() IS NOT NULL
    AND (
      (NULLIF(BTRIM(p_policy_number), '') IS NOT NULL
        AND ar.policy_number = NULLIF(BTRIM(p_policy_number), ''))
      OR (NULLIF(BTRIM(p_policy_root), '') IS NOT NULL
        AND (ar.policy_number = NULLIF(BTRIM(p_policy_root), '')
          OR ar.policy_number LIKE NULLIF(BTRIM(p_policy_root), '') || '-%'))
      OR (NULLIF(BTRIM(p_beneficiary_number), '') IS NOT NULL
        AND ar.beneficiary_number = NULLIF(BTRIM(p_beneficiary_number), ''))
    )
  ORDER BY ar.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.get_patient_authorization_history(text, text, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_authorization_history(text, text, text, integer)
  TO authenticated;

COMMIT;
