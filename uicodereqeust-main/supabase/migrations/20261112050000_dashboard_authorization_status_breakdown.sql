-- Return exact authorization counts by workflow status without transferring
-- request rows to the browser. Access is limited to staff roles that can see
-- the back-office authorization workload.
BEGIN;

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
    RAISE EXCEPTION 'An authenticated user identity is required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT ur.role
    INTO v_role
  FROM public.user_roles AS ur
  WHERE ur.user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN (
    'admin'::public.app_role,
    'nurse'::public.app_role,
    'utilization_manager'::public.app_role,
    'utilization_manager_lead'::public.app_role
  ) THEN
    RAISE EXCEPTION 'Access denied for authorization status summary.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('status', status, 'count', request_count)
      ORDER BY request_count DESC, status
    ),
    '[]'::jsonb
  )
    INTO v_status_counts
  FROM (
    SELECT
      COALESCE(NULLIF(lower(btrim(ar.status::text)), ''), '(blank)') AS status,
      count(*)::bigint AS request_count
    FROM public.authorization_requests AS ar
    GROUP BY COALESCE(NULLIF(lower(btrim(ar.status::text)), ''), '(blank)')
  ) AS counts;

  RETURN v_status_counts;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_authorization_status_breakdown() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_authorization_status_breakdown() TO authenticated;

COMMIT;
