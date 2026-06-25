-- Migration: force_backfill_emails
-- Performs a backfill of email, phone, created_at, and last_sign_in values from auth.users to user_roles.

BEGIN;

-- 1. Backfill user_ids where possible (inlined)
UPDATE public.user_roles ur
SET user_id = u.id
FROM auth.users u
WHERE ur.user_id IS NULL
  AND ur.email IS NOT NULL
  AND ur.email <> ''
  AND LOWER(ur.email) = LOWER(u.email);

-- 2. Sync email, phone, created_at, and last_sign_in columns for all linked rows
UPDATE public.user_roles ur
SET
  email = u.email,
  phone = COALESCE(ur.phone, u.phone),
  created_at = COALESCE(ur.created_at, u.created_at),
  last_sign_in = COALESCE(ur.last_sign_in, u.last_sign_in_at)
FROM auth.users u
WHERE ur.user_id = u.id;

-- 3. Also sync email/phone to hospitals table if null
UPDATE public.hospitals h
SET
  email = COALESCE(h.email, u.email),
  phone = COALESCE(h.phone, u.phone)
FROM auth.users u
WHERE h.user_id = u.id;

COMMIT;
