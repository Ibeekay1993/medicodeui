-- Migration: Fix arrival-pin OTP email domain
-- Removes the legacy medicode.com placeholder from ensure_arrival_pin_for_request
-- and backfills existing rows already written with the wrong domain.
-- Applied live on 2026-11-09 (via VPS psql); this file keeps fresh environments in sync.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Update the trigger function to use the canonical no-reply address
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_arrival_pin_for_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
  v_existing UUID;
BEGIN
  -- Use a stable, non-routable placeholder so the OTP row is never linked to a
  -- real inbox.  The domain must match the production brand.
  v_email := 'no-email@ronsbergerhmo.io';

  -- Idempotency guard: skip if an OTP row already exists for this request.
  SELECT id INTO v_existing
  FROM   otp_verifications
  WHERE  authorization_id = NEW.id
  LIMIT  1;

  IF v_existing IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO otp_verifications (
    authorization_id,
    email,
    otp_value,
    expires_at,
    created_at
  ) VALUES (
    NEW.id,
    v_email,
    LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0'),
    NOW() + INTERVAL '90 days',
    NOW()
  );

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Backfill any rows that were inserted with the legacy medicode.com domain
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE public.otp_verifications
SET    email = 'no-email@ronsbergerhmo.io'
WHERE  email = 'no-email@medicode.com';
