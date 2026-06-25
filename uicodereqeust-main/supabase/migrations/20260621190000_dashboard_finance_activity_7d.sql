-- Create dashboard_finance_activity_7d to track daily payments volume and paid value for the last 7 days
CREATE OR REPLACE FUNCTION public.dashboard_finance_activity_7d()
RETURNS TABLE (
  day date,
  day_label text,
  volume bigint,   -- count of claims marked paid
  amount numeric   -- total approved_amount of claims marked paid
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
  paid_counts AS (
    SELECT
      (hc.paid_at AT TIME ZONE 'Africa/Lagos')::date AS day,
      count(*)::bigint AS volume,
      coalesce(sum(coalesce(hc.approved_amount, hc.total_amount, 0)), 0)::numeric AS amount
    FROM public.hospital_claims hc
    WHERE hc.status = 'paid'
      AND hc.paid_at >= ((timezone('Africa/Lagos', now()))::date - 6)::timestamptz
      AND (v_role != 'hospital' OR hc.hospital_id = v_hospital_id)
    GROUP BY 1
  )
  SELECT
    d.day,
    to_char(d.day, 'Dy DD Mon') AS day_label,
    coalesce(pc.volume, 0) AS volume,
    coalesce(pc.amount, 0) AS amount
  FROM days d
  LEFT JOIN paid_counts pc ON pc.day = d.day
  ORDER BY d.day;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_finance_activity_7d() TO authenticated;
