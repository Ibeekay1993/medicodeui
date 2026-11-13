-- Enforce the hospital onboarding boundary in PostgreSQL as well as the UI.
-- Existing hospitals are deliberately not backfilled: each must receive its
-- verified onboarding timestamp through the Hospitals admin workflow.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_hospital_portal_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.has_role(auth.uid(), 'hospital'::public.app_role)
     AND NOT (
       public.has_role(auth.uid(), 'admin'::public.app_role)
       OR public.has_role(auth.uid(), 'nurse'::public.app_role)
       OR public.has_role(auth.uid(), 'utilization_manager'::public.app_role)
       OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)
       OR public.has_role(auth.uid(), 'claims'::public.app_role)
       OR public.has_role(auth.uid(), 'claims_lead'::public.app_role)
       OR public.has_role(auth.uid(), 'finance'::public.app_role)
     );
$$;

CREATE OR REPLACE FUNCTION public.current_hospital_onboarding_started_at(p_hospital_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT h.onboarding_started_at
  FROM public.hospitals AS h
  JOIN public.user_roles AS ur ON ur.hospital_id = h.id
  WHERE h.id = p_hospital_id
    AND ur.user_id = auth.uid()
    AND ur.role = 'hospital'::public.app_role
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.hospital_authorization_is_visible_after_onboarding(p_created_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NOT public.is_hospital_portal_user()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles AS ur
      JOIN public.hospitals AS h ON h.id = ur.hospital_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'hospital'::public.app_role
        AND h.onboarding_started_at IS NOT NULL
        AND p_created_at >= h.onboarding_started_at
    );
$$;

CREATE OR REPLACE FUNCTION public.hospital_claim_is_visible_after_onboarding(
  p_claim_created_at timestamptz,
  p_request_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NOT public.is_hospital_portal_user()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles AS ur
      JOIN public.hospitals AS h ON h.id = ur.hospital_id
      JOIN public.authorization_requests AS ar ON ar.id = p_request_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'hospital'::public.app_role
        AND h.onboarding_started_at IS NOT NULL
        AND p_claim_created_at >= h.onboarding_started_at
        AND ar.created_at >= h.onboarding_started_at
    );
$$;

REVOKE ALL ON FUNCTION public.is_hospital_portal_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_hospital_onboarding_started_at(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hospital_authorization_is_visible_after_onboarding(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hospital_claim_is_visible_after_onboarding(timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_hospital_portal_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_hospital_onboarding_started_at(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hospital_authorization_is_visible_after_onboarding(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hospital_claim_is_visible_after_onboarding(timestamptz, uuid) TO authenticated, service_role;

-- An un-onboarded hospital must not receive facility metrics through the
-- SECURITY DEFINER dashboard RPC.
CREATE OR REPLACE FUNCTION public.assert_hospital_facility_access(p_hospital_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  IF p_hospital_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'utilization_manager'::public.app_role)
     OR public.has_role(auth.uid(), 'utilization_manager_lead'::public.app_role)
     OR public.has_role(auth.uid(), 'claims'::public.app_role)
     OR public.has_role(auth.uid(), 'nurse'::public.app_role) THEN
    RETURN TRUE;
  END IF;

  IF public.has_role(auth.uid(), 'hospital'::public.app_role) THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.user_roles AS ur
      JOIN public.hospitals AS h ON h.id = ur.hospital_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'hospital'::public.app_role
        AND ur.hospital_id = p_hospital_id
        AND h.onboarding_started_at IS NOT NULL
    );
  END IF;

  RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_hospital_facility_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_hospital_facility_access(uuid) TO authenticated, service_role;

-- Restrictive policies are ANDed with the existing ownership policies. They
-- block pre-onboarding rows even if another permissive policy would allow them.
DROP POLICY IF EXISTS "Hospital onboarding cutoff for authorizations" ON public.authorization_requests;
CREATE POLICY "Hospital onboarding cutoff for authorizations"
  ON public.authorization_requests AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.hospital_authorization_is_visible_after_onboarding(created_at))
  WITH CHECK (public.hospital_authorization_is_visible_after_onboarding(created_at));

DROP POLICY IF EXISTS "Hospital onboarding cutoff for claims" ON public.hospital_claims;
CREATE POLICY "Hospital onboarding cutoff for claims"
  ON public.hospital_claims AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.hospital_claim_is_visible_after_onboarding(created_at, request_id))
  WITH CHECK (public.hospital_claim_is_visible_after_onboarding(created_at, request_id));

DROP POLICY IF EXISTS "Hospital onboarding cutoff for claim lines" ON public.hospital_claim_lines;
CREATE POLICY "Hospital onboarding cutoff for claim lines"
  ON public.hospital_claim_lines AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    NOT public.is_hospital_portal_user()
    OR EXISTS (
      SELECT 1
      FROM public.hospital_claims AS hc
      WHERE hc.id = hospital_claim_lines.claim_id
        AND public.hospital_claim_is_visible_after_onboarding(hc.created_at, hc.request_id)
    )
  )
  WITH CHECK (
    NOT public.is_hospital_portal_user()
    OR EXISTS (
      SELECT 1
      FROM public.hospital_claims AS hc
      WHERE hc.id = hospital_claim_lines.claim_id
        AND public.hospital_claim_is_visible_after_onboarding(hc.created_at, hc.request_id)
    )
  );

-- SECURITY DEFINER claim RPCs bypass RLS. This trigger validates the request
-- and facility for every hospital-originated claim write, including RPCs.
CREATE OR REPLACE FUNCTION public.enforce_hospital_claim_onboarding_cutoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hospital_id uuid;
  v_onboarding_started_at timestamptz;
  v_request_created_at timestamptz;
BEGIN
  IF NOT public.is_hospital_portal_user() THEN
    RETURN NEW;
  END IF;

  SELECT ur.hospital_id, h.onboarding_started_at
    INTO v_hospital_id, v_onboarding_started_at
  FROM public.user_roles AS ur
  JOIN public.hospitals AS h ON h.id = ur.hospital_id
  WHERE ur.user_id = auth.uid()
    AND ur.role = 'hospital'::public.app_role
  LIMIT 1;

  IF v_hospital_id IS NULL OR v_onboarding_started_at IS NULL THEN
    RAISE EXCEPTION 'Hospital onboarding has not started; claims cannot be submitted.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(NEW.claiming_hospital_id, NEW.hospital_id) IS DISTINCT FROM v_hospital_id THEN
    RAISE EXCEPTION 'This hospital is not the authorized claiming provider.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.created_at IS NULL OR NEW.created_at < v_onboarding_started_at THEN
    RAISE EXCEPTION 'Claims created before hospital onboarding are not eligible for portal processing.'
      USING ERRCODE = '23514';
  END IF;

  SELECT ar.created_at
    INTO v_request_created_at
  FROM public.authorization_requests AS ar
  WHERE ar.id = NEW.request_id;

  IF v_request_created_at IS NULL OR v_request_created_at < v_onboarding_started_at THEN
    RAISE EXCEPTION 'This authorization predates hospital onboarding and must be settled manually.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_hospital_claim_onboarding_cutoff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_hospital_claim_onboarding_cutoff() TO authenticated, service_role;
DROP TRIGGER IF EXISTS enforce_hospital_claim_onboarding_cutoff ON public.hospital_claims;
CREATE TRIGGER enforce_hospital_claim_onboarding_cutoff
  BEFORE INSERT OR UPDATE ON public.hospital_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_hospital_claim_onboarding_cutoff();

-- Dashboard RPCs run as their owner, so explicitly scope hospital aggregates
-- and recent lists to the onboarding timestamp and linked authorization.
CREATE OR REPLACE FUNCTION public.get_hospital_dashboard_metrics(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_is_hospital boolean := public.is_hospital_portal_user();
  v_onboarding_started_at timestamptz;
BEGIN
  IF NOT public.assert_hospital_facility_access(p_hospital_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have permission to access metrics for this hospital facility.';
  END IF;

  IF v_is_hospital THEN
    v_onboarding_started_at := public.current_hospital_onboarding_started_at(p_hospital_id);
  END IF;

  WITH auth_data AS (
    SELECT
      ar.id,
      ar.request_id,
      ar.patient_name,
      ar.policy_number,
      ar.diagnosis,
      ar.treatment,
      ar.authorization_code,
      ar.status,
      lower(ar.status) AS norm_status,
      COALESCE(ar.total_amount, 0) AS total_amount,
      ar.approved_items,
      ar.created_at,
      ar.claimed,
      ar.claim_status,
      ar.is_unlocked,
      ar.deletion_status,
      ar.referred_hospital_id,
      ar.claiming_hospital_id,
      ar.hospital_id
    FROM public.authorization_requests AS ar
    WHERE (
      ar.hospital_id = p_hospital_id
      OR ar.requesting_hospital_id = p_hospital_id
      OR ar.referring_hospital_id = p_hospital_id
      OR ar.referred_hospital_id = p_hospital_id
      OR ar.claiming_hospital_id = p_hospital_id
    )
      AND ar.is_historical = false
      AND COALESCE(ar.deletion_status, '') <> 'awaiting_admin_approval'
      AND lower(COALESCE(ar.status, '')) NOT IN ('deleted', 'awaiting_delete', 'withdrawn')
      AND (NOT v_is_hospital OR ar.created_at >= v_onboarding_started_at)
  ),
  auth_summary AS (
    SELECT
      COUNT(*) FILTER (WHERE norm_status IN ('approved', 'authorization_approved', 'partially_approved')) AS approved_count,
      COUNT(*) FILTER (WHERE norm_status IN ('pending', 'pending_referral', 'referral_approved', 'referral_accepted', 'pending_authorization', 'info_provided')) AS pending_count,
      COUNT(*) FILTER (WHERE norm_status IN ('rejected', 'declined', 'denied', 'referral_declined', 'referral_expired', 'accepted_referral_expired')) AS denied_count,
      COALESCE(SUM(total_amount) FILTER (
        WHERE norm_status IN ('approved', 'authorization_approved', 'partially_approved')
          AND NOT (referred_hospital_id IS NOT NULL AND hospital_id = p_hospital_id AND referred_hospital_id <> p_hospital_id)
      ), 0) AS total_authorized_value
    FROM auth_data
  ),
  claim_data AS (
    SELECT
      hc.id,
      hc.request_id,
      hc.claim_number,
      hc.auth_code,
      hc.patient_name,
      hc.policy_number,
      hc.status,
      lower(hc.status) AS norm_status,
      COALESCE(hc.total_amount, 0) AS total_amount,
      COALESCE(hc.approved_amount, hc.total_amount, 0) AS approved_amount,
      COALESCE(hc.declined_amount, 0) AS declined_amount,
      hc.payment_status,
      hc.contest_deadline,
      hc.created_at
    FROM public.hospital_claims AS hc
    WHERE (hc.hospital_id = p_hospital_id OR hc.claiming_hospital_id = p_hospital_id)
      AND (NOT v_is_hospital OR public.hospital_claim_is_visible_after_onboarding(hc.created_at, hc.request_id))
  ),
  claim_summary AS (
    SELECT
      COUNT(*) FILTER (WHERE norm_status IN ('submitted', 'under_review', 'pending')) AS in_audit_count,
      COALESCE(SUM(total_amount) FILTER (WHERE norm_status IN ('submitted', 'under_review', 'pending')), 0) AS in_audit_value,
      COUNT(*) FILTER (WHERE norm_status IN ('approved', 'partially_approved') AND lower(COALESCE(payment_status, '')) <> 'paid') AS awaiting_payment_count,
      COALESCE(SUM(approved_amount) FILTER (WHERE norm_status IN ('approved', 'partially_approved') AND lower(COALESCE(payment_status, '')) <> 'paid'), 0) AS pending_payout,
      COUNT(*) FILTER (WHERE norm_status = 'paid' OR lower(COALESCE(payment_status, '')) = 'paid') AS paid_count,
      COALESCE(SUM(approved_amount) FILTER (WHERE norm_status = 'paid' OR lower(COALESCE(payment_status, '')) = 'paid'), 0) AS paid_claims,
      COUNT(*) AS total_claims_count,
      COALESCE(SUM(total_amount), 0) AS total_claimed_value
    FROM claim_data
  ),
  approaching_claims AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'claim_number', claim_number,
      'patient_name', patient_name,
      'total_amount', total_amount,
      'approved_amount', approved_amount,
      'declined_amount', declined_amount,
      'contest_deadline', contest_deadline,
      'status', status
    ) ORDER BY contest_deadline ASC), '[]'::jsonb) AS list
    FROM claim_data
    WHERE norm_status = 'partially_approved'
      AND contest_deadline IS NOT NULL
      AND contest_deadline > now()
      AND contest_deadline <= now() + interval '5 days'
  ),
  recent_auths AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'request_id', request_id,
      'patient_name', patient_name,
      'policy_number', policy_number,
      'diagnosis', diagnosis,
      'authorization_code', authorization_code,
      'status', status,
      'total_amount', total_amount,
      'claimed', claimed,
      'claim_status', claim_status,
      'is_unlocked', is_unlocked,
      'created_at', created_at
    ) ORDER BY created_at DESC), '[]'::jsonb) AS list
    FROM (SELECT * FROM auth_data ORDER BY created_at DESC LIMIT 6) AS ra
  ),
  recent_claims_list AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'claim_number', claim_number,
      'auth_code', auth_code,
      'patient_name', patient_name,
      'total_amount', total_amount,
      'approved_amount', approved_amount,
      'declined_amount', declined_amount,
      'status', status,
      'payment_status', payment_status,
      'created_at', created_at
    ) ORDER BY created_at DESC), '[]'::jsonb) AS list
    FROM (SELECT * FROM claim_data ORDER BY created_at DESC LIMIT 6) AS rc
  )
  SELECT jsonb_build_object(
    'approvedCount', a.approved_count,
    'pendingCount', a.pending_count,
    'deniedCount', a.denied_count,
    'totalValue', a.total_authorized_value,
    'inAuditCount', c.in_audit_count,
    'inAuditValue', c.in_audit_value,
    'awaitingPaymentCount', c.awaiting_payment_count,
    'pendingPayout', c.pending_payout,
    'paidCount', c.paid_count,
    'paidClaims', c.paid_claims,
    'totalClaimsCount', c.total_claims_count,
    'totalClaimedValue', c.total_claimed_value,
    'approachingDeadlineClaims', ap.list,
    'recentAuthorizations', ra.list,
    'recentClaims', rcl.list
  )
  INTO v_result
  FROM auth_summary AS a, claim_summary AS c, approaching_claims AS ap,
       recent_auths AS ra, recent_claims_list AS rcl;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_hospital_dashboard_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hospital_dashboard_metrics(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_hospital_claims_stats(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_stats jsonb;
BEGIN
  IF NOT public.assert_hospital_facility_access(p_hospital_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have permission to access claims stats for this hospital facility.';
  END IF;

  SELECT jsonb_build_object(
    'pending', COUNT(*) FILTER (WHERE lower(hc.status) IN ('pending', 'submitted', 'under_review')),
    'approved', COUNT(*) FILTER (WHERE lower(hc.status) IN ('approved', 'partially_approved') AND lower(COALESCE(hc.payment_status, '')) <> 'paid'),
    'paid', COUNT(*) FILTER (WHERE lower(hc.status) = 'paid' OR lower(COALESCE(hc.payment_status, '')) = 'paid'),
    'contested', COUNT(*) FILTER (WHERE lower(hc.status) = 'contested'),
    'totalValue', COALESCE(SUM(hc.total_amount), 0),
    'approvedValue', COALESCE(SUM(COALESCE(hc.approved_amount, hc.total_amount)) FILTER (WHERE lower(hc.status) IN ('approved', 'partially_approved', 'paid')), 0)
  )
  INTO v_stats
  FROM public.hospital_claims AS hc
  WHERE (hc.hospital_id = p_hospital_id OR hc.claiming_hospital_id = p_hospital_id)
    AND public.hospital_claim_is_visible_after_onboarding(hc.created_at, hc.request_id);

  RETURN v_stats;
END;
$$;
REVOKE ALL ON FUNCTION public.get_hospital_claims_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hospital_claims_stats(uuid) TO authenticated, service_role;

-- The hospital branch of get_dashboard_stats is also SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_role public.app_role;
  v_hospital_id uuid;
  v_onboarding_started_at timestamptz;
  result json;
BEGIN
  SELECT ur.role, ur.hospital_id
    INTO v_role, v_hospital_id
  FROM public.user_roles AS ur
  WHERE ur.user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Unassigned Role';
  END IF;

  IF v_role = 'hospital' THEN
    v_onboarding_started_at := public.current_hospital_onboarding_started_at(v_hospital_id);

    WITH auth_raw AS (
      SELECT
        count(*)::bigint AS total,
        count(*) FILTER (WHERE lower(ar.status::text) IN ('approved', 'partially_approved', 'authorization_approved', 'referral_approved', 'referral_accepted'))::bigint AS approved,
        count(*) FILTER (WHERE lower(ar.status::text) IN ('rejected', 'declined', 'denied', 'referral_declined', 'referral_expired', 'accepted_referral_expired'))::bigint AS rejected,
        coalesce(sum(coalesce(ar.total_amount, ar.approved_tariff_amount, 0)) FILTER (WHERE lower(ar.status::text) IN ('approved', 'partially_approved', 'authorization_approved', 'referral_approved', 'referral_accepted')), 0)::numeric AS approved_amount
      FROM public.authorization_requests AS ar
      WHERE ar.hospital_id = v_hospital_id
        AND v_onboarding_started_at IS NOT NULL
        AND ar.created_at >= v_onboarding_started_at
        AND lower(coalesce(ar.status::text, '')) <> 'deferred'
    ),
    auth_stats AS (
      SELECT total, approved, rejected, greatest(total - approved - rejected, 0)::bigint AS pending, approved_amount
      FROM auth_raw
    ),
    claim_stats_summary AS (
      SELECT
        count(*)::bigint AS total,
        count(*) FILTER (WHERE hc.status = 'approved')::bigint AS approved,
        count(*) FILTER (WHERE hc.status IN ('rejected', 'declined', 'denied'))::bigint AS rejected,
        count(*) FILTER (WHERE hc.status IN ('submitted', 'pending'))::bigint AS pending
      FROM public.hospital_claims AS hc
      JOIN public.authorization_requests AS ar ON ar.id = hc.request_id
      WHERE hc.hospital_id = v_hospital_id
        AND v_onboarding_started_at IS NOT NULL
        AND hc.created_at >= v_onboarding_started_at
        AND ar.created_at >= v_onboarding_started_at
    )
    SELECT row_to_json(t) INTO result
    FROM (
      SELECT
        (SELECT row_to_json(auth_stats) FROM auth_stats) AS auth,
        0::bigint AS historical_auths,
        (SELECT row_to_json(claim_stats_summary) FROM claim_stats_summary) AS claims,
        0::bigint AS historical_claims,
        1 AS hospitals,
        1 AS users,
        '{}'::json AS roles,
        NULL::json AS admin_claims
    ) AS t;
  ELSE
    WITH auth_raw AS (
      SELECT
        count(*)::bigint AS total,
        count(*) FILTER (WHERE lower(ar.status::text) IN ('approved', 'partially_approved', 'authorization_approved', 'referral_approved', 'referral_accepted'))::bigint AS approved,
        count(*) FILTER (WHERE lower(ar.status::text) IN ('rejected', 'declined', 'denied', 'referral_declined', 'referral_expired', 'accepted_referral_expired'))::bigint AS rejected,
        coalesce(sum(coalesce(ar.total_amount, ar.approved_tariff_amount, 0)) FILTER (WHERE lower(ar.status::text) IN ('approved', 'partially_approved', 'authorization_approved', 'referral_approved', 'referral_accepted')), 0)::numeric AS approved_amount
      FROM public.authorization_requests AS ar
      WHERE lower(coalesce(ar.status::text, '')) <> 'deferred'
    ),
    auth_stats AS (
      SELECT total, approved, rejected, greatest(total - approved - rejected, 0)::bigint AS pending, approved_amount
      FROM auth_raw
    ),
    historical_auth AS (
      SELECT count(*)::bigint AS count FROM public.historical_codes WHERE record_type = 'authorization'
    ),
    claim_stats_summary AS (
      SELECT
        count(*)::bigint AS total,
        count(*) FILTER (WHERE hc.status = 'approved')::bigint AS approved,
        count(*) FILTER (WHERE hc.status IN ('rejected', 'declined', 'denied'))::bigint AS rejected,
        count(*) FILTER (WHERE hc.status IN ('submitted', 'pending'))::bigint AS pending
      FROM public.hospital_claims AS hc
    ),
    historical_claim AS (
      SELECT count(*)::bigint AS count FROM public.historical_codes WHERE record_type = 'claim'
    ),
    hospitals_count AS (SELECT count(*)::bigint AS count FROM public.hospitals),
    roles_dist AS (
      SELECT coalesce(json_object_agg(role, count), '{}'::json) AS dist,
             coalesce(sum(count), 0)::int AS total_users
      FROM (SELECT ur.role, count(*)::int AS count FROM public.user_roles AS ur GROUP BY ur.role) AS s
    ),
    admin_claim_stats AS (
      SELECT
        count(*) FILTER (WHERE hc.status IN ('submitted', 'pending', 'under_review'))::bigint AS submitted,
        count(*) FILTER (WHERE hc.status = 'approved')::bigint AS approved,
        count(*) FILTER (WHERE hc.status = 'partially_approved')::bigint AS partially_approved,
        count(*) FILTER (WHERE hc.status IN ('rejected', 'declined', 'denied'))::bigint AS rejected,
        count(*) FILTER (WHERE hc.status IN ('contested', 'under_contest'))::bigint AS contested,
        count(*) FILTER (WHERE hc.status = 'paid')::bigint AS paid,
        coalesce(sum(hc.total_amount), 0)::numeric AS claimed_value,
        coalesce(sum(hc.approved_amount), 0)::numeric AS approved_value,
        coalesce(sum(hc.declined_amount), 0)::numeric AS declined_value
      FROM public.hospital_claims AS hc
    )
    SELECT row_to_json(t) INTO result
    FROM (
      SELECT
        (SELECT row_to_json(auth_stats) FROM auth_stats) AS auth,
        (SELECT count FROM historical_auth) AS historical_auths,
        (SELECT row_to_json(claim_stats_summary) FROM claim_stats_summary) AS claims,
        (SELECT count FROM historical_claim) AS historical_claims,
        (SELECT count FROM hospitals_count) AS hospitals,
        (SELECT total_users FROM roles_dist) AS users,
        (SELECT dist FROM roles_dist) AS roles,
        (SELECT row_to_json(admin_claim_stats) FROM admin_claim_stats) AS admin_claims
    ) AS t;
  END IF;

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated, service_role;

-- Canonicalize legacy declines in the RPC so all dashboard clients see one
-- rejected count instead of a separate declined status row.
CREATE OR REPLACE FUNCTION public.get_dashboard_authorization_status_breakdown()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.app_role;
  v_status_counts jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'An authenticated user identity is required.' USING ERRCODE = '42501';
  END IF;

  SELECT ur.role INTO v_role
  FROM public.user_roles AS ur
  WHERE ur.user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN (
    'admin'::public.app_role,
    'nurse'::public.app_role,
    'utilization_manager'::public.app_role,
    'utilization_manager_lead'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Access denied for authorization status summary.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('status', status, 'count', request_count) ORDER BY request_count DESC, status),
    '[]'::jsonb
  )
  INTO v_status_counts
  FROM (
    SELECT
      CASE
        WHEN lower(btrim(ar.status::text)) IN ('rejected', 'declined', 'denied') THEN 'rejected'
        ELSE COALESCE(NULLIF(lower(btrim(ar.status::text)), ''), '(blank)')
      END AS status,
      count(*)::bigint AS request_count
    FROM public.authorization_requests AS ar
    GROUP BY 1
  ) AS counts;

  RETURN v_status_counts;
END;
$$;
REVOKE ALL ON FUNCTION public.get_dashboard_authorization_status_breakdown() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_authorization_status_breakdown() TO authenticated;

COMMIT;
