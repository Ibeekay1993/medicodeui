BEGIN;

-- =============================================================================
-- Migration: OTP System Hardening
-- Fixes:
--   1. Add consumed_at audit timestamp to otp_verifications
--   2. Fix get_otp_value to filter by otp_type (was missing this filter)
--   3. Fix verify_otp to set consumed_at on success (full audit trail)
--   4. Add hospital_id to get_otp_value return (needed for binding display)
-- =============================================================================

-- 1. Add consumed_at column (null = not yet consumed, timestamp = consumed)
ALTER TABLE public.otp_verifications
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;

-- =============================================================================
-- 2. Replace get_otp_value with corrected version:
--    - Filters by otp_type (was missing)
--    - Returns hospital_id for binding display
--    - SECURITY DEFINER bypasses the deny-all RLS on otp_verifications
--    - SET search_path = public ensures correct schema resolution
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_otp_value(UUID);
CREATE OR REPLACE FUNCTION public.get_otp_value(
  p_request_id UUID,
  p_otp_type   TEXT DEFAULT 'ARRIVAL'
)
RETURNS TABLE(
  otp_value   TEXT,
  email       TEXT,
  expires_at  TIMESTAMPTZ,
  verified    BOOLEAN,
  consumed_at TIMESTAMPTZ,
  hospital_id UUID,
  otp_type    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only nurses and admins can see OTP values in the queue
  IF NOT (
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'hospital')
  ) THEN
    RAISE EXCEPTION 'Access denied: only nurses, administrators, and hospitals can view OTP values';
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
  FROM public.otp_verifications ov
  WHERE ov.authorization_id = p_request_id
    AND ov.otp_type = p_otp_type
  ORDER BY ov.created_at DESC
  LIMIT 1;
END;
$$;

-- =============================================================================
-- 3. Replace verify_otp with hardened version:
--    - Sets consumed_at on successful verification
--    - Returns 'OTP already consumed' for already-consumed OTPs
--    - SECURITY DEFINER bypasses deny-all RLS
--    - SET search_path = public ensures correct schema resolution
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

  -- Guard: already consumed (consumed_at set OR verified flag)
  IF otp_record.consumed_at IS NOT NULL OR otp_record.verified THEN
    RETURN jsonb_build_object(
      'verified', false,
      'error', 'OTP already consumed — it cannot be reused'
    );
  END IF;

  -- Guard: expired
  IF otp_record.expires_at < now() THEN
    RETURN jsonb_build_object(
      'verified', false,
      'error', 'OTP has expired — please generate a new one'
    );
  END IF;

  -- Hash the plaintext and compare
  otp_plaintext_hash := encode(digest(p_otp_plaintext, 'sha256'), 'hex');

  IF otp_record.otp_hash = otp_plaintext_hash THEN
    -- Mark as consumed with full audit trail
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
  END IF;

  RETURN jsonb_build_object(
    'verified', false,
    'error', 'Invalid OTP — please check the code and try again'
  );
END;
$$;

-- =============================================================================
-- 4. Also fix the older 2-parameter verify_otp signature (keep backward compat)
-- =============================================================================
DROP FUNCTION IF EXISTS public.verify_otp(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.verify_otp(
  p_request_id    UUID,
  p_otp_plaintext TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delegate to the 4-parameter version with defaults
  RETURN public.verify_otp(p_request_id, p_otp_plaintext, 'ARRIVAL', NULL);
END;
$$;

-- =============================================================================
-- 5. Index on consumed_at for fast queries on active (non-consumed) OTPs
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_otp_verifications_consumed_at
  ON public.otp_verifications(consumed_at)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_otp_verifications_type
  ON public.otp_verifications(authorization_id, otp_type);

COMMIT;
