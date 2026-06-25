-- Migration: add_last_sign_in_to_user_roles
-- Adds last_sign_in column to user_roles, restores the auth.uid() IS NULL bypass in harden_user_roles, and updates sync triggers to populate last_sign_in.

BEGIN;

-- 1. Restore the bypass in public.harden_user_roles() for service_role / postgres context
CREATE OR REPLACE FUNCTION public.harden_user_roles()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow if running as service_role / postgres (no JWT = auth.uid() is NULL)
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  
  -- Otherwise require admin role
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'CyberSecurity Violation: Access Role Modification Denied';
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add last_sign_in column to user_roles if not exists
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS last_sign_in TIMESTAMPTZ;

-- 3. Update trigger function on auth.users created to include last_sign_in
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

  INSERT INTO public.user_roles (user_id, role, full_name, email, phone, hospital_id, access_status, created_at, last_sign_in)
  VALUES (
    new.id,
    COALESCE(meta_role::public.app_role, default_role),
    COALESCE(meta_fullname, 'Unnamed User'),
    new.email,
    new.phone,
    meta_hospital_id,
    'active',
    new.created_at,
    new.last_sign_in_at
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, user_roles.phone),
    full_name = COALESCE(EXCLUDED.full_name, user_roles.full_name),
    role = COALESCE(EXCLUDED.role, user_roles.role),
    hospital_id = COALESCE(EXCLUDED.hospital_id, user_roles.hospital_id),
    last_sign_in = EXCLUDED.last_sign_in;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 4. Update trigger function on auth.users updated to include last_sign_in
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
    hospital_id = COALESCE(meta_hospital_id, hospital_id),
    last_sign_in = new.last_sign_in_at
  WHERE user_id = new.id;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 5. Backfill existing last_sign_in values
UPDATE public.user_roles ur
SET last_sign_in = u.last_sign_in_at
FROM auth.users u
WHERE ur.user_id = u.id;

COMMIT;
