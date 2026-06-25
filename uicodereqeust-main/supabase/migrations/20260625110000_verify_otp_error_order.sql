BEGIN;

-- =============================================================================
-- Migration: Fix verify_otp Error Order
-- Fixes the error precedence in verify_otp so that it checks if the OTP is
-- ACTUALLY valid (hashes match) before checking if it is consumed or expired.
-- This ensures users see "Invalid OTP" when they type the wrong code,
-- rather than seeing "OTP has expired" for an incorrect code.
-- =============================================================================

DROP FUNCTION IF EXISTS public.verify_otp(UUID, TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.verify_otp(
  p_request_id    UUID,
  p_otp_plaintext TEXT,
  p_otp_type      TEXT DEFAULT 'ARRIVAL',
  p_hospital_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Fetch the most recent OTP matching request, type, and hospital binding
  SELECT * INTO otp_record
  FROM public.otp_verifications
  WHERE authorization_id = p_request_id
    AND otp_type = p_otp_type
    AND (hospital_id IS NULL OR hospital_id = p_hospital_id)
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

  -- The OTP is CORRECT. Now check its state.

  -- 2. Guard: already consumed (consumed_at set OR verified flag)
  IF otp_record.consumed_at IS NOT NULL OR otp_record.verified THEN
    RETURN jsonb_build_object(
      'verified', false,
      'error', 'OTP already consumed — it cannot be reused'
    );
  END IF;

  -- 3. Guard: expired
  IF otp_record.expires_at < now() THEN
    RETURN jsonb_build_object(
      'verified', false,
      'error', 'OTP has expired — please generate a new one'
    );
  END IF;

  -- 4. Mark as consumed with full audit trail
  UPDATE public.otp_verifications
  SET
    verified    = TRUE,
    consumed_at = now()
  WHERE id = otp_record.id;

  RETURN jsonb_build_object(
    'verified', true,
    'error', null,
    'consumed_at', now()
  );
END;
$$;

COMMIT;
