-- Migration: standard_user_sync_triggers
-- Adds created_at to user_roles and creates triggers on auth.users to automatically sync user profiles.

BEGIN;

-- 1. Add created_at column to user_roles if not exists
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Trigger function on auth.users created
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  default_role public.app_role := 'nurse';
  meta_role text;
  meta_fullname text;
  meta_hospital_id uuid;
BEGIN
  meta_role := new.raw_user_meta_data->>'role';
  meta_fullname := new.raw_user_meta_data->>'full_name';
  IF new.raw_user_meta_data->>'hospital_id' IS NOT NULL THEN
    BEGIN
      meta_hospital_id := (new.raw_user_meta_data->>'hospital_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      meta_hospital_id := NULL;
    END;
  END IF;

  INSERT INTO public.user_roles (user_id, role, full_name, email, phone, hospital_id, access_status, created_at)
  VALUES (
    new.id,
    COALESCE(meta_role::public.app_role, default_role),
    COALESCE(meta_fullname, 'Unnamed User'),
    new.email,
    new.phone,
    meta_hospital_id,
    'active',
    new.created_at
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, user_roles.phone),
    full_name = COALESCE(EXCLUDED.full_name, user_roles.full_name),
    role = COALESCE(EXCLUDED.role, user_roles.role),
    hospital_id = COALESCE(EXCLUDED.hospital_id, user_roles.hospital_id);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- 3. Trigger function on auth.users updated
CREATE OR REPLACE FUNCTION public.handle_update_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  meta_fullname text;
  meta_role text;
  meta_hospital_id uuid;
BEGIN
  meta_fullname := new.raw_user_meta_data->>'full_name';
  meta_role := new.raw_user_meta_data->>'role';
  IF new.raw_user_meta_data->>'hospital_id' IS NOT NULL THEN
    BEGIN
      meta_hospital_id := (new.raw_user_meta_data->>'hospital_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      meta_hospital_id := NULL;
    END;
  END IF;

  UPDATE public.user_roles
  SET
    email = new.email,
    phone = COALESCE(new.phone, phone),
    full_name = COALESCE(meta_fullname, full_name),
    role = COALESCE(meta_role::public.app_role, role),
    hospital_id = COALESCE(meta_hospital_id, hospital_id)
  WHERE user_id = new.id;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_update_auth_user();


-- 4. Backfill existing auth users who do not have a user_roles record
INSERT INTO public.user_roles (user_id, role, full_name, email, phone, access_status, created_at)
SELECT
  u.id,
  'nurse'::public.app_role,
  COALESCE(u.raw_user_meta_data->>'full_name', 'Unnamed User'),
  u.email,
  u.phone,
  'active',
  u.created_at
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.id IS NULL
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
