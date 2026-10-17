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
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mfa_enforced BOOLEAN := FALSE;
  v_mfa_exempt BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL OR NOT (
    public.has_role(v_user_id, 'nurse'::public.app_role) OR
    public.has_role(v_user_id, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied: only nurses and administrators can view OTP values'
      USING ERRCODE = '42501';
  END IF;

  SELECT gp.value @> '{"enforced": true}'::jsonb
  INTO v_mfa_enforced
  FROM public.global_policies AS gp
  WHERE gp.key = 'enforce_mfa';

  SELECT COALESCE(ur.mfa_exempt, FALSE)
  INTO v_mfa_exempt
  FROM public.user_roles AS ur
  WHERE ur.user_id = v_user_id;

  IF COALESCE(v_mfa_enforced, FALSE)
    AND NOT COALESCE(v_mfa_exempt, FALSE)
    AND (auth.jwt() ->> 'aal') IS DISTINCT FROM 'aal2'
  THEN
    RAISE EXCEPTION 'MFA verification is required to view OTP values'
      USING ERRCODE = '42501';
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
  JOIN public.authorization_requests AS ar
    ON ar.id = ov.authorization_id
  WHERE ar.id = p_request_id
    AND ov.otp_type = p_otp_type
  ORDER BY ov.created_at DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_otp_values_batch(p_request_ids UUID[])
RETURNS TABLE(
  authorization_id UUID,
  otp_value TEXT,
  email TEXT,
  expires_at TIMESTAMPTZ,
  verified BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_mfa_enforced BOOLEAN := FALSE;
  v_mfa_exempt BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL OR NOT (
    public.has_role(v_user_id, 'nurse'::public.app_role) OR
    public.has_role(v_user_id, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Access denied: only nurses and administrators can view OTP values'
      USING ERRCODE = '42501';
  END IF;

  SELECT gp.value @> '{"enforced": true}'::jsonb
  INTO v_mfa_enforced
  FROM public.global_policies AS gp
  WHERE gp.key = 'enforce_mfa';

  SELECT COALESCE(ur.mfa_exempt, FALSE)
  INTO v_mfa_exempt
  FROM public.user_roles AS ur
  WHERE ur.user_id = v_user_id;

  IF COALESCE(v_mfa_enforced, FALSE)
    AND NOT COALESCE(v_mfa_exempt, FALSE)
    AND (auth.jwt() ->> 'aal') IS DISTINCT FROM 'aal2'
  THEN
    RAISE EXCEPTION 'MFA verification is required to view OTP values'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(cardinality(p_request_ids), 0) > 100 THEN
    RAISE EXCEPTION 'At most 100 request IDs may be queried at once'
      USING ERRCODE = '22023';
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
      ROW_NUMBER() OVER (
        PARTITION BY ov.authorization_id, ov.otp_type
        ORDER BY ov.created_at DESC
      ) AS row_number
    FROM public.otp_verifications AS ov
    JOIN public.authorization_requests AS ar
      ON ar.id = ov.authorization_id
    WHERE ar.id = ANY(p_request_ids)
  ),
  latest_otps AS (
    SELECT * FROM otp_data WHERE row_number = 1
  )
  SELECT
    o.authorization_id,
    COALESCE(
      MAX(o.otp_value) FILTER (WHERE o.otp_type = 'ARRIVAL'),
      MAX(o.otp_value) FILTER (WHERE o.otp_type = 'TREATMENT'),
      MAX(o.otp_value)
    ),
    MAX(o.email),
    MAX(o.expires_at),
    BOOL_OR(o.verified)
  FROM latest_otps AS o
  GROUP BY o.authorization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_otp_value(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_otp_value(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.get_otp_values_batch(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_otp_values_batch(UUID[]) TO authenticated;

COMMIT;
