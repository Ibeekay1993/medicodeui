-- Update verify_otp so that if the OTP hash matches, it always returns verified = true,
-- even if it was already consumed. This allows the referred hospital to use the exact same
-- OTP to accept the referral, even after the referring hospital already consumed it to
-- view the referral code.

CREATE OR REPLACE FUNCTION public.verify_otp(
  p_request_id    UUID,
  p_otp_plaintext TEXT,
  p_otp_type      TEXT DEFAULT 'ARRIVAL',
  p_hospital_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  otp_record         RECORD;
  otp_plaintext_hash TEXT;
BEGIN
  -- Validate caller role
  IF NOT (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'claims') OR
    public.has_role(auth.uid(), 'hospital')
  ) THEN
    RETURN jsonb_build_object('verified', false, 'error', 'Access denied');
  END IF;

  -- Fetch the most recent OTP matching request and type
  SELECT * INTO otp_record
  FROM public.otp_verifications
  WHERE authorization_id = p_request_id
    AND otp_type = p_otp_type
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'verified', false,
      'error', 'No valid OTP found for this request'
    );
  END IF;

  -- 1. Hash the plaintext and compare first
  otp_plaintext_hash := encode(digest(p_otp_plaintext, 'sha256'), 'hex');

  IF otp_record.otp_hash != otp_plaintext_hash THEN
    RETURN jsonb_build_object(
      'verified', false,
      'error', 'Invalid OTP — please check the code and try again'
    );
  END IF;

  -- 2. If it matches, we ALWAYS consider it verified. 
  -- We mark it consumed if it hasn't been yet.
  IF otp_record.consumed_at IS NULL OR NOT otp_record.verified THEN
    -- Mark as consumed
    UPDATE public.otp_verifications
    SET
      verified    = TRUE,
      consumed_at = now()
    WHERE id = otp_record.id;
  END IF;
  
  -- 3. Mark the authorization request as permanently unlocked
  UPDATE public.authorization_requests
  SET is_unlocked = true
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'verified', true,
    'error', null,
    'consumed_at', COALESCE(otp_record.consumed_at, now())
  );
END;
$$;
