-- Migration: Secure dashboard statistics and activity RPCs by scoping them to user roles and tenants.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_hospital_id uuid;
  v_hospital_code text;
  result json;
BEGIN
  -- Resolve caller role and hospital mapping
  SELECT role, hospital_id INTO v_role, v_hospital_id
  FROM public.user_roles
  WHERE user_id = auth.uid();

  -- Prevent unassigned roles from accessing stats
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Unassigned Role';
  END IF;

  IF v_role = 'hospital' THEN
    -- Fetch hospital code for historical codes filtering
    SELECT code INTO v_hospital_code
    FROM public.hospitals
    WHERE id = v_hospital_id;

    -- Return scoped tenant stats
    WITH auth_stats AS (
      SELECT 
        coalesce(count(*), 0) as total,
        coalesce(count(*) FILTER (WHERE status = 'approved'), 0) as approved,
        coalesce(count(*) FILTER (WHERE status = 'rejected'), 0) as rejected,
        coalesce(count(*) FILTER (WHERE status = 'pending'), 0) as pending
      FROM public.authorization_requests
      WHERE hospital_id = v_hospital_id
    ),
    historical_auth AS (
      SELECT coalesce(count(*), 0) as count
      FROM public.historical_codes
      WHERE record_type = 'authorization'
        AND hospital_code = v_hospital_code
    ),
    claim_stats_summary AS (
      SELECT 
        coalesce(count(*), 0) as total,
        coalesce(count(*) FILTER (WHERE status = 'approved'), 0) as approved,
        coalesce(count(*) FILTER (WHERE status = 'rejected'), 0) as rejected,
        coalesce(count(*) FILTER (WHERE status IN ('submitted', 'pending')), 0) as pending
      FROM public.hospital_claims
      WHERE hospital_id = v_hospital_id
    ),
    historical_claim AS (
      SELECT coalesce(count(*), 0) as count
      FROM public.historical_codes
      WHERE record_type = 'claim'
        AND hospital_code = v_hospital_code
    )
    SELECT row_to_json(t) INTO result
    FROM (
      SELECT 
        (SELECT row_to_json(auth_stats) FROM auth_stats) as auth,
        (SELECT count FROM historical_auth) as historical_auths,
        (SELECT row_to_json(claim_stats_summary) FROM claim_stats_summary) as claims,
        (SELECT count FROM historical_claim) as historical_claims,
        1 as hospitals,
        1 as users,
        '{}'::json as roles,
        null::json as admin_claims
    ) t;

  ELSE
    -- Return global stats for admins/nurses/claims
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

  END IF;

  RETURN result;
END;
$$;


CREATE OR REPLACE FUNCTION public.dashboard_live_activity_7d()
RETURNS TABLE (
  day date,
  day_label text,
  volume bigint,
  approved bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_hospital_id uuid;
BEGIN
  -- Resolve caller role and hospital mapping
  SELECT role, hospital_id INTO v_role, v_hospital_id
  FROM public.user_roles
  WHERE user_id = auth.uid();

  -- Prevent unassigned roles from accessing activity
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Unassigned Role';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      (timezone('Africa/Lagos', now()))::date - 6,
      (timezone('Africa/Lagos', now()))::date,
      interval '1 day'
    )::date AS day
  ),
  counts AS (
    SELECT
      (ar.created_at AT TIME ZONE 'Africa/Lagos')::date AS day,
      count(*)::bigint AS volume,
      count(*) FILTER (WHERE ar.status = 'approved')::bigint AS approved
    FROM public.authorization_requests ar
    WHERE ar.source IN ('web', 'whatsapp')
      AND ar.created_at >= ((timezone('Africa/Lagos', now()))::date - 6)::timestamptz
      AND (v_role != 'hospital' OR ar.hospital_id = v_hospital_id)
    GROUP BY 1
  )
  SELECT
    d.day,
    to_char(d.day, 'Dy DD Mon') AS day_label,
    coalesce(c.volume, 0) AS volume,
    coalesce(c.approved, 0) AS approved
  FROM days d
  LEFT JOIN counts c ON c.day = d.day
  ORDER BY d.day;
END;
$$;


CREATE OR REPLACE FUNCTION public.dashboard_claims_activity_7d()
RETURNS TABLE (
  day date,
  day_label text,
  volume bigint,
  approved bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role app_role;
  v_hospital_id uuid;
BEGIN
  -- Resolve caller role and hospital mapping
  SELECT role, hospital_id INTO v_role, v_hospital_id
  FROM public.user_roles
  WHERE user_id = auth.uid();

  -- Prevent unassigned roles from accessing activity
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Unassigned Role';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      (timezone('Africa/Lagos', now()))::date - 6,
      (timezone('Africa/Lagos', now()))::date,
      interval '1 day'
    )::date AS day
  ),
  counts AS (
    SELECT
      (hc.created_at AT TIME ZONE 'Africa/Lagos')::date AS day,
      count(*)::bigint AS volume,
      count(*) FILTER (WHERE hc.status IN ('approved', 'partially_approved'))::bigint AS approved
    FROM public.hospital_claims hc
    WHERE hc.created_at >= ((timezone('Africa/Lagos', now()))::date - 6)::timestamptz
      AND (v_role != 'hospital' OR hc.hospital_id = v_hospital_id)
    GROUP BY 1
  )
  SELECT
    d.day,
    to_char(d.day, 'Dy DD Mon') AS day_label,
    coalesce(c.volume, 0) AS volume,
    coalesce(c.approved, 0) AS approved
  FROM days d
  LEFT JOIN counts c ON c.day = d.day
  ORDER BY d.day;
END;
$$;

COMMIT;
