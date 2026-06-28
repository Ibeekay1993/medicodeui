-- Update get_otp_values_batch to return combined Arrival and Treatment OTPs
CREATE OR REPLACE FUNCTION public.get_otp_values_batch(p_request_ids UUID[])
RETURNS TABLE(authorization_id UUID, otp_value TEXT, email TEXT, expires_at TIMESTAMPTZ, verified BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only nurses and admins and utilization_managers can see OTP values
  IF NOT (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'utilization_manager')
  ) THEN
    RAISE EXCEPTION 'Access denied: only nurses and administrators can view OTP values';
  END IF;

  RETURN QUERY
  WITH otp_data AS (
    SELECT
      ov.authorization_id,
      ov.otp_type,
      ov.otp_value,
      ov.email,
      ov.expires_at,
      ov.verified,
      ROW_NUMBER() OVER (PARTITION BY ov.authorization_id, ov.otp_type ORDER BY ov.created_at DESC) as rn
    FROM public.otp_verifications ov
    WHERE ov.authorization_id = ANY(p_request_ids)
  ),
  latest_otps AS (
    SELECT * FROM otp_data WHERE rn = 1
  )
  SELECT
    o.authorization_id,
    CASE 
      WHEN MAX(CASE WHEN o.otp_type = 'ARRIVAL' THEN o.otp_value END) IS NOT NULL 
       AND MAX(CASE WHEN o.otp_type = 'TREATMENT' THEN o.otp_value END) IS NOT NULL
      THEN 'ARR: ' || MAX(CASE WHEN o.otp_type = 'ARRIVAL' THEN o.otp_value END) || ' | TRT: ' || MAX(CASE WHEN o.otp_type = 'TREATMENT' THEN o.otp_value END)
      
      WHEN MAX(CASE WHEN o.otp_type = 'ARRIVAL' THEN o.otp_value END) IS NOT NULL
      THEN 'ARR: ' || MAX(CASE WHEN o.otp_type = 'ARRIVAL' THEN o.otp_value END)
      
      WHEN MAX(CASE WHEN o.otp_type = 'TREATMENT' THEN o.otp_value END) IS NOT NULL
      THEN 'TRT: ' || MAX(CASE WHEN o.otp_type = 'TREATMENT' THEN o.otp_value END)
      
      ELSE MAX(o.otp_value) -- Fallback for STANDARD or NULL type
    END as otp_value,
    MAX(o.email) as email,
    MAX(o.expires_at) as expires_at,
    BOOL_OR(o.verified) as verified
  FROM latest_otps o
  GROUP BY o.authorization_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_otp_values_batch(UUID[]) TO authenticated;
