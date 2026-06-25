-- Accurate 7-day live desk chart (web + WhatsApp only, Lagos calendar dates, created_at)
CREATE OR REPLACE FUNCTION public.dashboard_live_activity_7d()
RETURNS TABLE (
  day date,
  day_label text,
  volume bigint,
  approved bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
      AND ar.created_at >= (
        (timezone('Africa/Lagos', now()))::date - 6
      )::timestamptz
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
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_live_activity_7d() TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_claims_activity_7d()
RETURNS TABLE (
  day date,
  day_label text,
  volume bigint,
  approved bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    WHERE hc.created_at >= (
      (timezone('Africa/Lagos', now()))::date - 6
    )::timestamptz
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
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_claims_activity_7d() TO authenticated;
