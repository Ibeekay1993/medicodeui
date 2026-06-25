-- Fix Claims Activity RPC to separately track volume by creation and approved by approval_at
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
  created_counts AS (
    SELECT
      (hc.created_at AT TIME ZONE 'Africa/Lagos')::date AS day,
      count(*)::bigint AS volume
    FROM public.hospital_claims hc
    WHERE hc.created_at >= ((timezone('Africa/Lagos', now()))::date - 6)::timestamptz
      AND (v_role != 'hospital' OR hc.hospital_id = v_hospital_id)
    GROUP BY 1
  ),
  approved_counts AS (
    SELECT
      (hc.approved_at AT TIME ZONE 'Africa/Lagos')::date AS day,
      count(*)::bigint AS approved
    FROM public.hospital_claims hc
    WHERE hc.approved_at >= ((timezone('Africa/Lagos', now()))::date - 6)::timestamptz
      AND hc.status IN ('approved', 'partially_approved')
      AND (v_role != 'hospital' OR hc.hospital_id = v_hospital_id)
    GROUP BY 1
  )
  SELECT
    d.day,
    to_char(d.day, 'Dy DD Mon') AS day_label,
    coalesce(cc.volume, 0) AS volume,
    coalesce(ac.approved, 0) AS approved
  FROM days d
  LEFT JOIN created_counts cc ON cc.day = d.day
  LEFT JOIN approved_counts ac ON ac.day = d.day
  ORDER BY d.day;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_claims_activity_7d() TO authenticated;

-- Allow finance role to view claims
DROP POLICY IF EXISTS "Claims can read hospital claims" ON public.hospital_claims;
CREATE POLICY "Claims can read hospital claims"
  ON public.hospital_claims
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'claims') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'finance')
  );

-- Allow finance role to update claims (setting batch_id and status)
DROP POLICY IF EXISTS "Claims can update hospital claims" ON public.hospital_claims;
CREATE POLICY "Claims can update hospital claims"
  ON public.hospital_claims
  FOR UPDATE
  TO authenticated
  USING (
    (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
    AND status IN ('submitted', 'pending', 'under_review', 'approved', 'partially_approved', 'rejected', 'contested', 'under_contest')
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
    AND status IN ('submitted', 'pending', 'under_review', 'approved', 'partially_approved', 'rejected', 'paid', 'contested', 'under_contest')
  );

-- Allow finance role to read claim lines
DROP POLICY IF EXISTS "Claims can read hospital claim lines" ON public.hospital_claim_lines;
CREATE POLICY "Claims can read hospital claim lines"
  ON public.hospital_claim_lines
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.hospital_claims hc
      WHERE hc.id = claim_id
        AND (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
    )
  );

-- Allow claims and finance roles to select hospitals (so they can resolve names and dropdown lists)
DROP POLICY IF EXISTS "Nurses can view all hospitals" ON public.hospitals;
CREATE POLICY "Nurses can view all hospitals"
  ON public.hospitals
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'nurse') OR 
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'claims') OR
    public.has_role(auth.uid(), 'finance')
  );
