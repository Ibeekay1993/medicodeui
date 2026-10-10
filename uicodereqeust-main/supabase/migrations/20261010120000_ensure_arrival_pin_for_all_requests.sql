BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_arrival_pin_for_request(
  p_authorization_id UUID,
  p_patient_email TEXT DEFAULT NULL,
  p_hospital_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  existing_pin TEXT;
  new_pin TEXT;
  random_bytes BYTEA;
  alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  PERFORM pg_advisory_xact_lock(20261010, 1200);

  SELECT otp_value
  INTO existing_pin
  FROM public.otp_verifications
  WHERE authorization_id = p_authorization_id
    AND otp_type = 'ARRIVAL'
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_pin IS NOT NULL THEN
    RETURN existing_pin;
  END IF;

  LOOP
    random_bytes := gen_random_bytes(6);
    new_pin := '';
    FOR i IN 0..5 LOOP
      new_pin := new_pin || substr(alphabet, (get_byte(random_bytes, i) % length(alphabet)) + 1, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.otp_verifications
      WHERE otp_value = new_pin
        AND verified = FALSE
    );
  END LOOP;

  INSERT INTO public.otp_verifications (
    authorization_id,
    otp_hash,
    otp_value,
    email,
    expires_at,
    otp_type,
    hospital_id
  )
  VALUES (
    p_authorization_id,
    encode(digest(new_pin, 'sha256'), 'hex'),
    new_pin,
    COALESCE(NULLIF(btrim(p_patient_email), ''), 'no-email@medicode.com'),
    now() + interval '10 years',
    'ARRIVAL',
    p_hospital_id
  );

  RETURN new_pin;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_arrival_pin_for_request(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_arrival_pin_for_authorization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  PERFORM public.ensure_arrival_pin_for_request(
    NEW.id,
    NEW.patient_email,
    COALESCE(NEW.claiming_hospital_id, NEW.referred_hospital_id, NEW.hospital_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_arrival_pin_for_authorization_trigger
  ON public.authorization_requests;
CREATE TRIGGER create_arrival_pin_for_authorization_trigger
  AFTER INSERT ON public.authorization_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.create_arrival_pin_for_authorization();

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
    ov.otp_type
  FROM public.otp_verifications AS ov
  WHERE ov.authorization_id = p_request_id
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
    WHERE ov.authorization_id = ANY(p_request_ids)
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

GRANT EXECUTE ON FUNCTION public.get_otp_values_batch(UUID[]) TO authenticated;

DO $$
DECLARE
  request_row RECORD;
BEGIN
  FOR request_row IN
    SELECT
      ar.id,
      ar.patient_email,
      COALESCE(ar.claiming_hospital_id, ar.referred_hospital_id, ar.hospital_id) AS hospital_id
    FROM public.authorization_requests AS ar
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.otp_verifications AS ov
      WHERE ov.authorization_id = ar.id
        AND ov.otp_type = 'ARRIVAL'
    )
  LOOP
    PERFORM public.ensure_arrival_pin_for_request(
      request_row.id,
      request_row.patient_email,
      request_row.hospital_id
    );
  END LOOP;
END;
$$;

COMMIT;
