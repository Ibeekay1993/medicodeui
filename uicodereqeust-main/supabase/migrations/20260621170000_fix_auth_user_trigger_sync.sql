-- Migration: fix_auth_user_trigger_sync
-- Fixes the `handle_update_auth_user` trigger so that it only overwrites `user_roles`
-- fields if they have actually changed in `auth.users.raw_user_meta_data`.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_update_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  meta_fullname text;
  meta_role text;
  meta_hospital_id uuid;
BEGIN
  -- Only update user_roles with metadata if the metadata actually changed from old to new.
  -- Otherwise, it would overwrite admin changes made directly to user_roles.
  
  IF new.raw_user_meta_data->>'full_name' IS DISTINCT FROM old.raw_user_meta_data->>'full_name' THEN
    meta_fullname := new.raw_user_meta_data->>'full_name';
  ELSE
    meta_fullname := NULL;
  END IF;

  IF new.raw_user_meta_data->>'role' IS DISTINCT FROM old.raw_user_meta_data->>'role' THEN
    meta_role := new.raw_user_meta_data->>'role';
  ELSE
    meta_role := NULL;
  END IF;

  IF new.raw_user_meta_data->>'hospital_id' IS DISTINCT FROM old.raw_user_meta_data->>'hospital_id' THEN
    IF new.raw_user_meta_data->>'hospital_id' IS NOT NULL THEN
      BEGIN
        meta_hospital_id := (new.raw_user_meta_data->>'hospital_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        meta_hospital_id := NULL;
      END;
    END IF;
  ELSE
    meta_hospital_id := NULL;
  END IF;

  UPDATE public.user_roles
  SET
    email = new.email,
    -- phone = COALESCE(new.phone, phone), -- Do not blindly overwrite phone from auth.users unless it changed
    phone = CASE WHEN new.phone IS DISTINCT FROM old.phone THEN new.phone ELSE phone END,
    full_name = COALESCE(meta_fullname, full_name),
    role = COALESCE(meta_role::public.app_role, role),
    hospital_id = CASE WHEN new.raw_user_meta_data->>'hospital_id' IS DISTINCT FROM old.raw_user_meta_data->>'hospital_id' THEN meta_hospital_id ELSE hospital_id END
  WHERE user_id = new.id;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
