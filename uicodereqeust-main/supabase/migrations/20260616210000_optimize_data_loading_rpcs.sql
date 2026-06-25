-- Migration: Speed optimization RPC functions for dashboard and OTP loading
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  WITH auth_stats AS (
    SELECT 
      coalesce(count(*), 0) as total,
      coalesce(count(*) FILTER (WHERE status = 'approved'), 0) as approved,
      coalesce(count(*) FILTER (WHERE status = 'rejected'), 0) as rejected,
      coalesce(count(*) FILTER (WHERE status = 'pending'), 0) as pending
    FROM public.authorization_requests
  ),
  historical_auth AS (
    SELECT coalesce(count(*), 0) as count
    FROM public.historical_codes
    WHERE record_type = 'authorization'
  ),
  claim_stats_summary AS (
    SELECT 
      coalesce(count(*), 0) as total,
      coalesce(count(*) FILTER (WHERE status = 'approved'), 0) as approved,
      coalesce(count(*) FILTER (WHERE status = 'rejected'), 0) as rejected,
      coalesce(count(*) FILTER (WHERE status IN ('submitted', 'pending')), 0) as pending
    FROM public.hospital_claims
  ),
  historical_claim AS (
    SELECT coalesce(count(*), 0) as count
    FROM public.historical_codes
    WHERE record_type = 'claim'
  ),
  hospitals_count AS (
    SELECT coalesce(count(*), 0) as count FROM public.hospitals
  ),
  roles_dist AS (
    SELECT 
      coalesce(json_object_agg(role, count), '{}'::json) as dist,
      coalesce(sum(count), 0)::int as total_users
    FROM (
      SELECT role, count(*)::int as count 
      FROM public.user_roles 
      GROUP BY role
    ) s
  ),
  admin_claim_stats AS (
    SELECT 
      coalesce(count(*) FILTER (WHERE status IN ('submitted', 'pending', 'under_review')), 0) as submitted,
      coalesce(count(*) FILTER (WHERE status = 'approved'), 0) as approved,
      coalesce(count(*) FILTER (WHERE status = 'partially_approved'), 0) as partially_approved,
      coalesce(count(*) FILTER (WHERE status IN ('rejected', 'declined', 'denied')), 0) as rejected,
      coalesce(count(*) FILTER (WHERE status IN ('contested', 'under_contest')), 0) as contested,
      coalesce(count(*) FILTER (WHERE status = 'paid'), 0) as paid,
      coalesce(sum(total_amount), 0)::numeric as claimed_value,
      coalesce(sum(approved_amount), 0)::numeric as approved_value,
      coalesce(sum(declined_amount), 0)::numeric as declined_value
    FROM public.hospital_claims
  )
  SELECT row_to_json(t) INTO result
  FROM (
    SELECT 
      (SELECT row_to_json(auth_stats) FROM auth_stats) as auth,
      (SELECT count FROM historical_auth) as historical_auths,
      (SELECT row_to_json(claim_stats_summary) FROM claim_stats_summary) as claims,
      (SELECT count FROM historical_claim) as historical_claims,
      (SELECT count FROM hospitals_count) as hospitals,
      (SELECT total_users FROM roles_dist) as users,
      (SELECT dist FROM roles_dist) as roles,
      (SELECT row_to_json(admin_claim_stats) FROM admin_claim_stats) as admin_claims
  ) t;
  
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;


CREATE OR REPLACE FUNCTION public.get_otp_values_batch(p_request_ids UUID[])
RETURNS TABLE(authorization_id UUID, otp_value TEXT, email TEXT, expires_at TIMESTAMPTZ, verified BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only nurses and admins can see OTP values
  IF NOT (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Access denied: only nurses and administrators can view OTP values';
  END IF;

  RETURN QUERY
  WITH ranked_otps AS (
    SELECT
      ov.authorization_id,
      ov.otp_value,
      ov.email,
      ov.expires_at,
      ov.verified,
      ROW_NUMBER() OVER (PARTITION BY ov.authorization_id ORDER BY ov.created_at DESC) as rn
    FROM public.otp_verifications ov
    WHERE ov.authorization_id = ANY(p_request_ids)
  )
  SELECT
    ro.authorization_id,
    ro.otp_value,
    ro.email,
    ro.expires_at,
    ro.verified
  FROM ranked_otps ro
  WHERE ro.rn = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_otp_values_batch(UUID[]) TO authenticated;
