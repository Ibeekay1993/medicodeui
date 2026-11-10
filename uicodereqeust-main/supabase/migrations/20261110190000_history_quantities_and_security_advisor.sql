BEGIN;

-- Add persisted approval line items to the history RPC so the UI can display
-- approved quantities without issuing a second database query. The return
-- shape changes, so replace the RPC explicitly (without CASCADE).
DROP FUNCTION public.get_patient_authorization_history(text, text, text, integer);

CREATE FUNCTION public.get_patient_authorization_history(
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
  approved_items jsonb,
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
SET search_path = ''
AS $$
  SELECT
    ar.id,
    ar.request_id,
    ar.patient_name,
    ar.policy_number,
    ar.beneficiary_number,
    ar.diagnosis,
    ar.treatment,
    ar.approved_items,
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

-- The public.users view is only needed by trusted backend compatibility
-- lookups. Make it obey invoker privileges and remove browser API access.
DO $$
DECLARE
  v_kind "char";
  v_version integer := current_setting('server_version_num')::integer;
BEGIN
  SELECT c.relkind INTO v_kind
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'users';

  IF v_kind IS NULL THEN
    RAISE NOTICE 'public.users is absent; skipping view hardening on this environment';
  ELSIF v_kind <> 'v' THEN
    RAISE EXCEPTION 'public.users is not a regular view (relkind=%); inspect its definition before applying this migration', v_kind;
  ELSIF v_version < 150000 THEN
    RAISE EXCEPTION 'PostgreSQL 15 or newer is required for security_invoker views; current version is %', v_version;
  ELSE
    EXECUTE 'ALTER VIEW public.users SET (security_invoker = true)';
    EXECUTE 'REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.users TO service_role';
  END IF;
END;
$$;

-- These immutable helpers reference their dependencies with schema-qualified
-- names. An empty search_path prevents object shadowing if called under a
-- different role or from a SECURITY DEFINER resolution RPC.
ALTER FUNCTION public.normalize_whatsapp_identity_name(text) SET search_path = '';
ALTER FUNCTION public.match_whatsapp_identity_name(text, text) SET search_path = '';

NOTIFY pgrst, 'reload schema';

COMMIT;
