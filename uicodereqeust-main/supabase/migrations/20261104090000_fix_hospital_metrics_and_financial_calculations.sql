-- =========================================================================================
-- Migration: Fix Hospital Metrics and Precise Financial Calculations
-- Purpose:
-- 1. Correct Authorization Value calculation: ONLY sum approved and partially approved requests.
-- 2. Include partially_approved in approved_count so decisions are never omitted.
-- 3. Exclude deleted, awaiting_delete, or withdrawn requests from active counts.
-- 4. Correct Pending Reimbursement: approved/partially_approved claims where payment_status != 'paid'.
-- 5. Add In-Audit Claims (submitted) and Contested Claims metrics.
-- 6. Provide high-density live recent authorizations and recent claims directly in the RPC.
-- =========================================================================================

BEGIN;

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

  WITH auth_data AS (
    SELECT 
      id,
      request_id,
      patient_name,
      policy_number,
      diagnosis,
      treatment,
      authorization_code,
      status,
      lower(status) AS norm_status,
      COALESCE(total_amount, 0) AS total_amount,
      approved_items,
      created_at,
      claimed,
      claim_status,
      is_unlocked,
      deletion_status,
      referred_hospital_id,
      claiming_hospital_id,
      hospital_id
    FROM public.authorization_requests
    WHERE (
      hospital_id = p_hospital_id
      OR requesting_hospital_id = p_hospital_id
      OR referring_hospital_id = p_hospital_id
      OR referred_hospital_id = p_hospital_id
      OR claiming_hospital_id = p_hospital_id
    )
    AND is_historical = false
    AND COALESCE(deletion_status, '') != 'awaiting_admin_approval'
    AND lower(COALESCE(status, '')) NOT IN ('deleted', 'awaiting_delete', 'withdrawn')
  ),
  auth_summary AS (
    SELECT 
      -- Approved includes fully approved AND partially approved (clinical care authorized)
      COUNT(*) FILTER (WHERE norm_status IN ('approved', 'authorization_approved', 'partially_approved')) AS approved_count,
      -- Pending includes requests waiting for medical examination or referral confirmation
      COUNT(*) FILTER (WHERE norm_status IN ('pending', 'pending_referral', 'referral_approved', 'referral_accepted', 'pending_authorization', 'info_provided')) AS pending_count,
      -- Denied includes rejected or expired referrals
      COUNT(*) FILTER (WHERE norm_status IN ('rejected', 'referral_declined', 'referral_expired')) AS denied_count,
      -- Total Authorized Value: ONLY sum requests where care was actually APPROVED or PARTIALLY APPROVED!
      -- If referral was made to an external hospital, the treating hospital gets the authorized value.
      COALESCE(
        SUM(total_amount) FILTER (
          WHERE norm_status IN ('approved', 'authorization_approved', 'partially_approved')
            AND NOT (referred_hospital_id IS NOT NULL AND hospital_id = p_hospital_id AND referred_hospital_id != p_hospital_id)
        ), 
        0
      ) AS total_authorized_value
    FROM auth_data
  ),
  claim_data AS (
    SELECT 
      id,
      claim_number,
      auth_code,
      patient_name,
      policy_number,
      status,
      lower(status) AS norm_status,
      COALESCE(total_amount, 0) AS total_amount,
      COALESCE(approved_amount, total_amount, 0) AS approved_amount,
      COALESCE(declined_amount, 0) AS declined_amount,
      payment_status,
      contest_deadline,
      created_at
    FROM public.hospital_claims
    WHERE (
      hospital_id = p_hospital_id
      OR claiming_hospital_id = p_hospital_id
    )
  ),
  claim_summary AS (
    SELECT
      -- Claims submitted and currently undergoing medical audit by HMO
      COUNT(*) FILTER (WHERE norm_status IN ('submitted', 'under_review', 'pending')) AS in_audit_count,
      COALESCE(SUM(total_amount) FILTER (WHERE norm_status IN ('submitted', 'under_review', 'pending')), 0) AS in_audit_value,
      -- Claims approved by claims examiners, awaiting bank batch payment
      COUNT(*) FILTER (WHERE norm_status IN ('approved', 'partially_approved') AND lower(COALESCE(payment_status, '')) != 'paid') AS awaiting_payment_count,
      COALESCE(
        SUM(approved_amount) FILTER (
          WHERE norm_status IN ('approved', 'partially_approved') 
            AND lower(COALESCE(payment_status, '')) != 'paid'
        ), 
        0
      ) AS pending_payout,
      -- Claims fully disbursed and paid
      COUNT(*) FILTER (WHERE norm_status = 'paid' OR lower(COALESCE(payment_status, '')) = 'paid') AS paid_count,
      COALESCE(
        SUM(approved_amount) FILTER (
          WHERE norm_status = 'paid' OR lower(COALESCE(payment_status, '')) = 'paid'
        ), 
        0
      ) AS paid_claims,
      -- Total claims submitted
      COUNT(*) AS total_claims_count,
      COALESCE(SUM(total_amount), 0) AS total_claimed_value
    FROM claim_data
  ),
  approaching_claims AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'claim_number', claim_number,
          'patient_name', patient_name,
          'total_amount', total_amount,
          'approved_amount', approved_amount,
          'declined_amount', declined_amount,
          'contest_deadline', contest_deadline,
          'status', status
        ) ORDER BY contest_deadline ASC
      ),
      '[]'::jsonb
    ) AS list
    FROM claim_data
    WHERE norm_status = 'partially_approved'
      AND contest_deadline IS NOT NULL
      AND contest_deadline > now()
      AND contest_deadline <= (now() + interval '5 days')
  ),
  recent_auths AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
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
        ) ORDER BY created_at DESC
      ),
      '[]'::jsonb
    ) AS list
    FROM (
      SELECT * FROM auth_data ORDER BY created_at DESC LIMIT 6
    ) ra
  ),
  recent_claims_list AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
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
        ) ORDER BY created_at DESC
      ),
      '[]'::jsonb
    ) AS list
    FROM (
      SELECT * FROM claim_data ORDER BY created_at DESC LIMIT 6
    ) rc
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
  FROM auth_summary a, claim_summary c, approaching_claims ap, recent_auths ra, recent_claims_list rcl;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hospital_dashboard_metrics(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hospital_dashboard_metrics(UUID) TO authenticated, service_role;

-- 2. Precision upgrade for get_hospital_claims_stats
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
    'approved', COUNT(*) FILTER (WHERE lower(status) IN ('approved', 'partially_approved') AND lower(COALESCE(payment_status, '')) != 'paid'),
    'paid', COUNT(*) FILTER (WHERE lower(status) = 'paid' OR lower(COALESCE(payment_status, '')) = 'paid'),
    'contested', COUNT(*) FILTER (WHERE lower(status) = 'contested'),
    'totalValue', COALESCE(SUM(total_amount), 0),
    'approvedValue', COALESCE(SUM(COALESCE(approved_amount, total_amount)) FILTER (WHERE lower(status) IN ('approved', 'partially_approved', 'paid')), 0)
  )
  INTO v_stats
  FROM public.hospital_claims
  WHERE hospital_id = p_hospital_id OR claiming_hospital_id = p_hospital_id;

  RETURN v_stats;
END;
$$;

REVOKE ALL ON FUNCTION public.get_hospital_claims_stats(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hospital_claims_stats(UUID) TO authenticated, service_role;

COMMIT;
