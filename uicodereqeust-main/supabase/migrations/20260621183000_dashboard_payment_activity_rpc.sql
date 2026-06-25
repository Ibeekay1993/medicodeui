-- Create Payment Activity RPC for finance dashboard
-- Tracks claims paid (status = 'paid') grouped by paid_at date

CREATE OR REPLACE FUNCTION public.dashboard_payment_activity_7d()
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
  SELECT role, hospital_id INTO v_role, v_hospital_id
  FROM public.user_roles
  WHERE user_id = auth.uid();

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
  paid_counts AS (
    SELECT
      COALESCE(
        (hc.paid_at AT TIME ZONE 'Africa/Lagos')::date,
        (hc.created_at AT TIME ZONE 'Africa/Lagos')::date
      ) AS day,
      count(*)::bigint AS volume
    FROM public.hospital_claims hc
    WHERE hc.status = ANY (ARRAY['paid','partially_paid'])
      AND COALESCE(
        (hc.paid_at AT TIME ZONE 'Africa/Lagos')::date,
        (hc.created_at AT TIME ZONE 'Africa/Lagos')::date
      ) >= (timezone('Africa/Lagos', now()))::date - 6
      AND (v_role != 'hospital' OR hc.hospital_id = v_hospital_id)
    GROUP BY 1
  ),
  paid_amounts AS (
    SELECT
      COALESCE(
        (hc.paid_at AT TIME ZONE 'Africa/Lagos')::date,
        (hc.created_at AT TIME ZONE 'Africa/Lagos')::date
      ) AS day,
      sum(COALESCE(hc.approved_amount, hc.total_amount, 0))::bigint AS approved
    FROM public.hospital_claims hc
    WHERE hc.status = ANY (ARRAY['paid','partially_paid'])
      AND COALESCE(
        (hc.paid_at AT TIME ZONE 'Africa/Lagos')::date,
        (hc.created_at AT TIME ZONE 'Africa/Lagos')::date
      ) >= (timezone('Africa/Lagos', now()))::date - 6
      AND (v_role != 'hospital' OR hc.hospital_id = v_hospital_id)
    GROUP BY 1
  )
  SELECT
    d.day,
    to_char(d.day, 'Dy DD Mon') AS day_label,
    coalesce(pc.volume, 0) AS volume,
    coalesce(pa.approved, 0) AS approved
  FROM days d
  LEFT JOIN paid_counts pc ON pc.day = d.day
  LEFT JOIN paid_amounts pa ON pa.day = d.day
  ORDER BY d.day;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_payment_activity_7d() TO authenticated;
