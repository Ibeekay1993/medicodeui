-- =========================================================================================
-- Migration: Harden Hospital Dashboard Security, Isolation and Performance Aggregations
-- Purpose:
-- 1. Strictly enforce tenant isolation on hospital_claims and authorization_requests.
-- 2. Provide high-performance SECURITY DEFINER aggregation RPCs for the hospital dashboard
--    and claims statistics, eliminating multi-thousand-row client downloads.
-- 3. Enforce strict server-side authorization checks on hospital metrics.
-- =========================================================================================

BEGIN;

-- 1. Security validation helper
CREATE OR REPLACE FUNCTION public.assert_hospital_facility_access(p_hospital_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  IF p_hospital_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Admin, Utilization Managers, and Claims officers have broader access
  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'utilization_manager'::public.app_role)
     OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)
     OR public.has_role(auth.uid(), 'claims'::public.app_role)
     OR public.has_role(auth.uid(), 'nurse'::public.app_role) THEN
    RETURN TRUE;
  END IF;

  -- Hospital users MUST have matching hospital_id in public.user_roles
  IF public.has_role(auth.uid(), 'hospital'::public.app_role) THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'hospital'::public.app_role
        AND ur.hospital_id = p_hospital_id
    );
  END IF;

  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_hospital_facility_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_hospital_facility_access(UUID) TO authenticated, service_role;

-- 2. Supporting performance indexes
CREATE INDEX IF NOT EXISTS idx_authorization_requests_referring_hospital_id 
  ON public.authorization_requests(referring_hospital_id);

CREATE INDEX IF NOT EXISTS idx_hospital_claims_claiming_hospital_id 
  ON public.hospital_claims(claiming_hospital_id);

-- 3. Dedicated fast Hospital Dashboard Metrics RPC
CREATE OR REPLACE FUNCTION public.get_hospital_dashboard_metrics(p_hospital_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.assert_hospital_facility_access(p_hospital_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have permission to access metrics for this hospital facility.';
  END IF;

  WITH auth_summary AS (
    SELECT 
      COUNT(*) FILTER (WHERE lower(status) IN ('approved', 'authorization_approved')) AS approved_count,
      COUNT(*) FILTER (WHERE lower(status) IN ('pending', 'pending_referral', 'referral_approved', 'referral_accepted', 'pending_authorization')) AS pending_count,
      COUNT(*) FILTER (WHERE lower(status) IN ('rejected', 'referral_declined', 'referral_expired')) AS denied_count,
      COALESCE(SUM(total_amount) FILTER (WHERE NOT (referred_hospital_id IS NOT NULL AND hospital_id = p_hospital_id)), 0) AS total_value
    FROM public.authorization_requests
    WHERE (
      hospital_id = p_hospital_id
      OR requesting_hospital_id = p_hospital_id
      OR referring_hospital_id = p_hospital_id
      OR referred_hospital_id = p_hospital_id
      OR claiming_hospital_id = p_hospital_id
    )
    AND is_historical = false
  ),
  claim_summary AS (
    SELECT
      COALESCE(SUM(COALESCE(approved_amount, total_amount)) FILTER (WHERE lower(status) IN ('approved', 'partially_approved')), 0) AS pending_payout,
      COALESCE(SUM(COALESCE(approved_amount, total_amount)) FILTER (WHERE lower(status) = 'paid'), 0) AS paid_claims
    FROM public.hospital_claims
    WHERE (
      hospital_id = p_hospital_id
      OR claiming_hospital_id = p_hospital_id
    )
  ),
  approaching_claims AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'claim_number', claim_number,
          'patient_name', patient_name,
          'contest_deadline', contest_deadline,
          'status', status
        )
      ),
      '[]'::jsonb
    ) AS list
    FROM public.hospital_claims
    WHERE (hospital_id = p_hospital_id OR claiming_hospital_id = p_hospital_id)
      AND lower(status) = 'partially_approved'
      AND contest_deadline IS NOT NULL
      AND contest_deadline > now()
      AND contest_deadline <= (now() + interval '5 days')
  )
  SELECT jsonb_build_object(
    'approvedCount', a.approved_count,
    'pendingCount', a.pending_count,
    'deniedCount', a.denied_count,
    'totalValue', a.total_value,
    'pendingPayout', c.pending_payout,
    'paidClaims', c.paid_claims,
    'approachingDeadlineClaims', ap.list
  )
  INTO v_result
  FROM auth_summary a, claim_summary c, approaching_claims ap;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hospital_dashboard_metrics(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hospital_dashboard_metrics(UUID) TO authenticated, service_role;

-- 4. Dedicated fast Hospital Claims Stats RPC
CREATE OR REPLACE FUNCTION public.get_hospital_claims_stats(p_hospital_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_stats JSONB;
BEGIN
  IF NOT public.assert_hospital_facility_access(p_hospital_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have permission to access claims stats for this hospital facility.';
  END IF;

  SELECT jsonb_build_object(
    'pending', COUNT(*) FILTER (WHERE lower(status) IN ('pending', 'submitted', 'under_review')),
    'approved', COUNT(*) FILTER (WHERE lower(status) IN ('approved', 'partially_approved')),
    'paid', COUNT(*) FILTER (WHERE lower(status) = 'paid'),
    'totalValue', COALESCE(SUM(total_amount), 0)
  )
  INTO v_stats
  FROM public.hospital_claims
  WHERE hospital_id = p_hospital_id OR claiming_hospital_id = p_hospital_id;

  RETURN v_stats;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hospital_claims_stats(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hospital_claims_stats(UUID) TO authenticated, service_role;

-- 5. Tighten RLS on public.hospital_claims
DROP POLICY IF EXISTS "Hospitals can read own claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can read own claims"
  ON public.hospital_claims
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'hospital'::public.app_role
        AND ur.hospital_id IS NOT NULL
        AND (
          hospital_claims.hospital_id = ur.hospital_id
          OR hospital_claims.claiming_hospital_id = ur.hospital_id
          OR hospital_claims.request_id IN (
            SELECT ar.id 
            FROM public.authorization_requests ar
            WHERE ur.hospital_id = ANY (ARRAY[
              ar.hospital_id,
              ar.requesting_hospital_id,
              ar.referring_hospital_id,
              ar.referred_hospital_id,
              ar.claiming_hospital_id
            ])
          )
        )
    )
  );

COMMIT;
