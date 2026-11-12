-- ============================================================================
-- Cross-tenant privilege escalation fix
--
-- Problem: the policy "users can update their own onboarding columns" lets any
-- signed-in user UPDATE their own user_roles row. The latest harden_user_roles
-- trigger (20261009170000) blocks changes to role, access_status, user_id,
-- email and mfa_exempt, but NOT hospital_id. Eleven RLS policies and the edge
-- function auth helper decide which hospital's data a user may see from
-- user_roles.hospital_id, so a hospital user could point their own row at
-- another hospital and read or change that hospital's patients and claims.
--
-- Fix: a BEFORE UPDATE trigger that stops non-admin users changing hospital_id
-- or is_team_lead on their own row. Allowed cases:
--   * service role / SQL migrations (auth.uid() IS NULL)
--   * admins
--   * the value does not change
--   * first-time link: hospital_id is currently NULL and the new value is a
--     hospital row that already belongs to this same user (hospitals.user_id)
-- Safe to re-run.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.protect_user_role_tenant_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.hospital_id IS DISTINCT FROM OLD.hospital_id THEN
    IF NOT (
      auth.uid() = NEW.user_id
      AND OLD.hospital_id IS NULL
      AND NEW.hospital_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.hospitals h
        WHERE h.id = NEW.hospital_id
          AND h.user_id = NEW.user_id
      )
    ) THEN
      RAISE EXCEPTION 'Hospital assignment can only be changed by an administrator.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.is_team_lead IS DISTINCT FROM OLD.is_team_lead THEN
    RAISE EXCEPTION 'Team lead status can only be changed by an administrator.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_user_role_tenant_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_user_role_tenant_columns() TO service_role;

DROP TRIGGER IF EXISTS protect_user_role_tenant_columns ON public.user_roles;
CREATE TRIGGER protect_user_role_tenant_columns
  BEFORE UPDATE OF hospital_id, is_team_lead ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_role_tenant_columns();

COMMIT;

-- ============================================================================
-- Manual authorization check (replace the uuids):
--   SET ROLE authenticated;
--   SET request.jwt.claim.sub = '<a hospital user id>';
--   UPDATE public.user_roles SET hospital_id = '<another hospital id>'
--   WHERE user_id = '<a hospital user id>';
-- Before the fix this succeeds. After it, it must fail with 42501.
-- ============================================================================
