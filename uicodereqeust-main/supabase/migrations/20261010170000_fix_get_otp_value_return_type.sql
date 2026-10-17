BEGIN;

CREATE OR REPLACE FUNCTION public.get_otp_value(
  p_request_id UUID,
  p_otp_type TEXT DEFAULT 'ARRIVAL'
)
RETURNS TABLE(
  otp_value TEXT,
  email TEXT,
  expires_at TIMESTAMPTZ,
  verified BOOLEAN,
  consumed_at TIMESTAMPTZ,
  hospital_id UUID,
  otp_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'utilization_manager') OR
    public.has_role(auth.uid(), 'utilization_manager_lead')
  ) THEN
    RAISE EXCEPTION 'Access denied: only clinical staff and administrators can view OTP values';
  END IF;

  RETURN QUERY
  SELECT
    ov.otp_value,
    ov.email,
    ov.expires_at,
    ov.verified,
    ov.consumed_at,
    ov.hospital_id,
    ov.otp_type::TEXT
  FROM public.otp_verifications AS ov
  WHERE ov.authorization_id = p_request_id
    AND ov.otp_type = p_otp_type
  ORDER BY ov.created_at DESC
  LIMIT 1;
END;
$$;

COMMIT;
