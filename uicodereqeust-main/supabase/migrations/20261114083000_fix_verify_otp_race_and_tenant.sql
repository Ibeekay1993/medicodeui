-- ============================================================================
-- Migration: 20261114083000_fix_verify_otp_race_and_tenant.sql
-- Corrective migration for 20261114080000: fixes four security gaps.
--
-- 1. SELECT ... FOR UPDATE — prevents concurrent guesses from racing past
--    the attempt counter.
-- 2. NULL hospital_id on caller → DENY instead of silently skipping the
--    ownership check.
-- 3. search_path = '' — pg_catalog is always searched implicitly; keeping
--    public out of the definer path prevents search-path hijacking even if
--    an untrusted role can CREATE in public.  All referenced objects are
--    now schema-qualified.
-- 4. expires_at enforcement — the column defaults to now() + 1 hour.
--    Without an expiry check, the 5-attempt lockout only delays brute-force
--    by 15 minutes at a time; with the check, an OTP is at most usable for
--    the duration set in expires_at (currently 1 hour).
-- ============================================================================
BEGIN;

-- Ensure lockout columns exist (idempotent — they may already be present
-- from the previous migration).
ALTER TABLE public.otp_verifications
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL;

-- Drop the 4-param overload first so CREATE OR REPLACE can change it cleanly.
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
SET search_path = ''
AS $$
DECLARE
  otp_record            RECORD;
  otp_plaintext_hash    TEXT;
  v_caller_hospital_id  UUID;
  v_clean_otp           TEXT;
  v_new_failures        INTEGER;
BEGIN
  -- ── A. Require authenticated user ──────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('verified', false, 'error', 'Authentication required');
  END IF;

  -- ── B. Validate caller role ────────────────────────────────────────────
  IF NOT (
    public.has_role(auth.uid(), 'nurse'::public.app_role) OR
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'claims'::public.app_role) OR
    public.has_role(auth.uid(), 'hospital'::public.app_role)
  ) THEN
    RETURN jsonb_build_object('verified', false, 'error', 'Access denied');
  END IF;

  -- ── C. Tenant ownership enforcement ────────────────────────────────────
  -- Hospital users MUST have a hospital_id; if missing, deny rather than skip.
  IF public.has_role(auth.uid(), 'hospital'::public.app_role) THEN
    SELECT ur.hospital_id INTO v_caller_hospital_id
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    LIMIT 1;

    IF v_caller_hospital_id IS NULL THEN
      RETURN jsonb_build_object(
        'verified', false,
        'error', 'Access denied: your account has no hospital association'
      );
    END IF;

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

  -- ── D. Fetch and LOCK the most recent OTP row ─────────────────────────
  -- FOR UPDATE prevents a concurrent transaction from reading the same
  -- failed_attempts value and overwriting the counter.
  SELECT * INTO otp_record
  FROM public.otp_verifications
  WHERE authorization_id = p_request_id
    AND otp_type = p_otp_type
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'verified', false,
      'error', 'No valid OTP found for this request'
    );
  END IF;

  -- ── E. Brute-force lockout ─────────────────────────────────────────────
  IF otp_record.locked_until IS NOT NULL AND otp_record.locked_until > now() THEN
    RETURN jsonb_build_object(
      'verified', false,
      'error', 'Too many failed attempts. Verification is locked. Please try again later or contact support.'
    );
  END IF;

  -- ── F. OTP expiry ─────────────────────────────────────────────────────
  -- expires_at defaults to now()+1 hour at INSERT.  Without this check an
  -- attacker gets unlimited 15-minute lockout windows to brute-force the PIN.
  IF otp_record.expires_at IS NOT NULL AND otp_record.expires_at < now() THEN
    RETURN jsonb_build_object(
      'verified', false,
      'error', 'OTP has expired — please generate a new one'
    );
  END IF;

  -- ── G. Input sanitisation and hash ─────────────────────────────────────
  v_clean_otp := upper(trim(COALESCE(p_otp_plaintext, '')));

  IF length(v_clean_otp) = 0 THEN
    RETURN jsonb_build_object(
      'verified', false,
      'error', 'Please enter a valid OTP'
    );
  END IF;

  otp_plaintext_hash := encode(extensions.digest(v_clean_otp, 'sha256'), 'hex');

  -- ── H. Hash comparison ────────────────────────────────────────────────
  IF otp_record.otp_hash != otp_plaintext_hash THEN
    -- Atomic increment: we already hold FOR UPDATE lock.
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

  -- ── I. Success — reset counter, mark consumed, unlock request ─────────
  -- OTP reuse is intentionally permitted (referral flow: both referring and
  -- referred hospitals verify the same OTP).  We mark consumed_at on the
  -- first successful use; subsequent correct uses still return verified=true.
  UPDATE public.otp_verifications
  SET
    verified        = TRUE,
    consumed_at     = COALESCE(consumed_at, now()),
    failed_attempts = 0,
    locked_until    = NULL
  WHERE id = otp_record.id;

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

-- ── 2-parameter overload for backward compatibility ──────────────────────
DROP FUNCTION IF EXISTS public.verify_otp(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.verify_otp(
  p_request_id    UUID,
  p_otp_plaintext TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.verify_otp(p_request_id, p_otp_plaintext, 'ARRIVAL', NULL);
END;
$$;

-- ── Permissions ──────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.verify_otp(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_otp(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_otp(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_otp(UUID, TEXT) TO authenticated, service_role;

COMMIT;
