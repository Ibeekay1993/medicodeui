-- ============================================================================
-- Critical: privilege escalation through user-editable auth metadata
--
-- Problem
--   handle_new_auth_user() builds the user_roles row from
--   raw_user_meta_data->>'role' and ->>'hospital_id', and defaults to the staff
--   role 'nurse'. handle_update_auth_user() copies later changes of those same
--   keys into user_roles. raw_user_meta_data is the "user_metadata" that the
--   account holder controls (auth.signUp({options:{data}}) and
--   auth.updateUser({data})). Result:
--     * a new signup with {"role":"admin"} becomes an active administrator;
--     * a new signup can bind itself to any hospital_id;
--     * any signed-in user, for example a hospital user, becomes admin with one
--       auth.updateUser({data:{role:"admin"}}) call.
--   Both trigger functions are SECURITY DEFINER and run with no user JWT, so
--   the harden_user_roles guard (auth.uid() IS NULL -> allow) does not stop it.
--
-- Fix
--   Never read role or hospital_id from user_metadata. A row created by any
--   path other than the invite-user edge function starts locked (suspended,
--   setup required, no hospital). invite-user already writes the real role with
--   the service key immediately after creating the account, so invitations are
--   unaffected. Full name and phone sync is kept.
--
-- Operational note: accounts you create by hand in the Supabase dashboard will
-- now start locked until an administrator activates them (UPDATE
-- public.user_roles ... or the invite flow).
-- Also set GOTRUE_DISABLE_SIGNUP=true on the auth service (see audit report).
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  meta_fullname text := NULLIF(left(NEW.raw_user_meta_data->>'full_name', 200), '');
BEGIN
  INSERT INTO public.user_roles (
    user_id, role, full_name, email, phone, hospital_id, access_status,
    created_at, last_sign_in, onboarding_completed, onboarding_completed_at,
    invite_status, account_setup_required
  )
  VALUES (
    NEW.id,
    'hospital'::public.app_role,
    COALESCE(meta_fullname, 'Unnamed User'),
    NEW.email,
    NEW.phone,
    NULL,
    'suspended',
    NEW.created_at,
    NEW.last_sign_in_at,
    false,
    NULL,
    'pending',
    true
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, public.user_roles.phone),
    last_sign_in = EXCLUDED.last_sign_in;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_update_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  meta_fullname text;
BEGIN
  IF NEW.raw_user_meta_data->>'full_name' IS DISTINCT FROM OLD.raw_user_meta_data->>'full_name' THEN
    meta_fullname := NULLIF(left(NEW.raw_user_meta_data->>'full_name', 200), '');
  END IF;

  UPDATE public.user_roles
  SET
    email = NEW.email,
    phone = CASE WHEN NEW.phone IS DISTINCT FROM OLD.phone THEN NEW.phone ELSE phone END,
    full_name = COALESCE(meta_fullname, full_name)
  WHERE user_id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_update_auth_user() FROM PUBLIC, anon, authenticated;

COMMIT;
