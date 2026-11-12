-- Keep authorization dashboard totals aligned with the status definitions used
-- by reports and the decision workflow. Historical imports stay in their own
-- count and never inflate the approved count.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_role public.app_role;
  v_hospital_id uuid;
  result json;
BEGIN
  SELECT ur.role, ur.hospital_id
    INTO v_role, v_hospital_id
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Unassigned Role';
  END IF;

  IF v_role = 'hospital' THEN
    WITH auth_raw AS (
      SELECT
        count(*)::bigint AS total,
        count(*) FILTER (WHERE lower(ar.status::text) IN (
          'approved', 'partially_approved', 'authorization_approved',
          'referral_approved', 'referral_accepted'
        ))::bigint AS approved,
        count(*) FILTER (WHERE lower(ar.status::text) IN (
          'rejected', 'referral_declined', 'referral_expired',
          'accepted_referral_expired'
        ))::bigint AS rejected,
        coalesce(sum(coalesce(ar.total_amount, ar.approved_tariff_amount, 0))
          FILTER (WHERE lower(ar.status::text) IN (
            'approved', 'partially_approved', 'authorization_approved',
            'referral_approved', 'referral_accepted'
          )), 0)::numeric AS approved_amount
      FROM public.authorization_requests ar
      WHERE ar.hospital_id = v_hospital_id
        AND lower(coalesce(ar.status::text, '')) <> 'deferred'
    ),
    auth_stats AS (
      SELECT total, approved, rejected,
        greatest(total - approved - rejected, 0)::bigint AS pending,
        approved_amount
      FROM auth_raw
    ),
    claim_stats_summary AS (
      SELECT
        count(*)::bigint AS total,
        count(*) FILTER (WHERE hc.status = 'approved')::bigint AS approved,
        count(*) FILTER (WHERE hc.status = 'rejected')::bigint AS rejected,
        count(*) FILTER (WHERE hc.status IN ('submitted', 'pending'))::bigint AS pending
      FROM public.hospital_claims hc
      WHERE hc.hospital_id = v_hospital_id
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
    ) t;
  ELSE
    WITH auth_raw AS (
      SELECT
        count(*)::bigint AS total,
        count(*) FILTER (WHERE lower(ar.status::text) IN (
          'approved', 'partially_approved', 'authorization_approved',
          'referral_approved', 'referral_accepted'
        ))::bigint AS approved,
        count(*) FILTER (WHERE lower(ar.status::text) IN (
          'rejected', 'referral_declined', 'referral_expired',
          'accepted_referral_expired'
        ))::bigint AS rejected,
        coalesce(sum(coalesce(ar.total_amount, ar.approved_tariff_amount, 0))
          FILTER (WHERE lower(ar.status::text) IN (
            'approved', 'partially_approved', 'authorization_approved',
            'referral_approved', 'referral_accepted'
          )), 0)::numeric AS approved_amount
      FROM public.authorization_requests ar
      WHERE lower(coalesce(ar.status::text, '')) <> 'deferred'
    ),
    auth_stats AS (
      SELECT total, approved, rejected,
        greatest(total - approved - rejected, 0)::bigint AS pending,
        approved_amount
      FROM auth_raw
    ),
    historical_auth AS (
      SELECT count(*)::bigint AS count
      FROM public.historical_codes
      WHERE record_type = 'authorization'
    ),
    claim_stats_summary AS (
      SELECT
        count(*)::bigint AS total,
        count(*) FILTER (WHERE hc.status = 'approved')::bigint AS approved,
        count(*) FILTER (WHERE hc.status = 'rejected')::bigint AS rejected,
        count(*) FILTER (WHERE hc.status IN ('submitted', 'pending'))::bigint AS pending
      FROM public.hospital_claims hc
    ),
    historical_claim AS (
      SELECT count(*)::bigint AS count
      FROM public.historical_codes
      WHERE record_type = 'claim'
    ),
    hospitals_count AS (
      SELECT count(*)::bigint AS count FROM public.hospitals
    ),
    roles_dist AS (
      SELECT
        coalesce(json_object_agg(role, count), '{}'::json) AS dist,
        coalesce(sum(count), 0)::int AS total_users
      FROM (
        SELECT ur.role, count(*)::int AS count
        FROM public.user_roles ur
        GROUP BY ur.role
      ) s
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
      FROM public.hospital_claims hc
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
    ) t;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated, service_role;

COMMIT;
