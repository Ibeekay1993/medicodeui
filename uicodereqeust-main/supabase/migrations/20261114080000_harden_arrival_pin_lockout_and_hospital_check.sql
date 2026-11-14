-- ============================================================================
-- Migration: 20261114080000_harden_arrival_pin_lockout_and_hospital_check.sql
-- Security Hardening: Finding F6 — Arrival PIN Brute-force Lockout & Hospital Ownership Validation
-- ============================================================================
BEGIN;

-- 1. Ensure lockout and attempt tracking columns exist on otp_verifications
ALTER TABLE public.otp_verifications
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL;

-- 2. Hardened verify_otp RPC
CREATE OR REPLACE FUNCTION public.verify_otp(
  p_request_id    UUID,
  p_otp_plaintext TEXT,
  p_otp_type      TEXT DEFAULT 'ARRIVAL',
  p_hospital_id   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  otp_record            RECORD;
  otp_plaintext_hash    TEXT;
  v_caller_hospital_id  UUID;
  v_clean_otp           TEXT;
  v_new_failures        INTEGER;
BEGIN
  -- A. Require authenticated user
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('verified', false, 'error', 'Authentication required');
  END IF;

  -- B. Validate caller role
  IF NOT (
    public.has_role(auth.uid(), 'nurse'::public.app_role) OR
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'claims'::public.app_role) OR
    public.has_role(auth.uid(), 'hospital'::public.app_role)
  ) THEN
    RETURN jsonb_build_object('verified', false, 'error', 'Access denied');
  END IF;

  -- C. Tenant Ownership Enforcement:
  -- If caller is a hospital user, verify that the authorization request
  -- actually belongs to their hospital (direct, referring, or referred).
  IF public.has_role(auth.uid(), 'hospital'::public.app_role) THEN
    SELECT ur.hospital_id INTO v_caller_hospital_id
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    LIMIT 1;

    IF v_caller_hospital_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.authorization_requests ar
        WHERE ar.id = p_request_id
          AND (
            ar.hospital_id = v_caller_hospital_id
            OR ar.referring_hospital_id = v_caller_hospital_id
            OR ar.referred_hospital_id = v_caller_hospital_id
          )
      ) THEN
        RETURN jsonb_build_object(
          'verified', false,
          'error', 'Access denied: this authorization request does not belong to your hospital'
        );
      END IF;
    END IF;
  END IF;

  -- D. Fetch the most recent OTP record matching the request and type
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

  -- E. Brute-force Lockout Check:
  -- If currently locked out due to excessive failed attempts, fail closed.
  IF otp_record.locked_until IS NOT NULL AND otp_record.locked_until > now() THEN
    RETURN jsonb_build_object(
      'verified', false,
      'error', 'Too many failed attempts. Verification is locked. Please try again later or contact support.'
    );
  END IF;

  -- F. Input sanitation and cryptographic hash comparison
  v_clean_otp := UPPER(TRIM(COALESCE(p_otp_plaintext, '')));

  IF length(v_clean_otp) = 0 THEN
    RETURN jsonb_build_object(
      'verified', false,
      'error', 'Please enter a valid OTP'
    );
  END IF;

  otp_plaintext_hash := encode(digest(v_clean_otp, 'sha256'), 'hex');

  -- G. Check hash match
  IF otp_record.otp_hash != otp_plaintext_hash THEN
    v_new_failures := COALESCE(otp_record.failed_attempts, 0) + 1;

    UPDATE public.otp_verifications
    SET
      failed_attempts = v_new_failures,
      locked_until = CASE
        WHEN v_new_failures >= 5 THEN now() + interval '15 minutes'
        ELSE NULL
      END
    WHERE id = otp_record.id;

    IF v_new_failures >= 5 THEN
      RETURN jsonb_build_object(
        'verified', false,
        'error', 'Too many failed attempts. This PIN is now locked for 15 minutes.'
      );
    ELSE
      RETURN jsonb_build_object(
        'verified', false,
        'error', format('Invalid OTP — %s attempt(s) remaining', 5 - v_new_failures)
      );
    END IF;
  END IF;

  -- H. On success: reset failure counter and unlock
  UPDATE public.otp_verifications
  SET
    verified        = TRUE,
    consumed_at     = COALESCE(consumed_at, now()),
    failed_attempts = 0,
    locked_until    = NULL
  WHERE id = otp_record.id;

  -- Mark the authorization request as permanently unlocked
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

-- 3. Maintain 2-parameter overload compatibility
CREATE OR REPLACE FUNCTION public.verify_otp(
  p_request_id    UUID,
  p_otp_plaintext TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  RETURN public.verify_otp(p_request_id, p_otp_plaintext, 'ARRIVAL', NULL);
END;
$$;

-- 4. Permissions: service_role and authenticated users only (no anonymous access)
REVOKE ALL ON FUNCTION public.verify_otp(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_otp(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_otp(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_otp(UUID, TEXT) TO authenticated, service_role;

COMMIT;
