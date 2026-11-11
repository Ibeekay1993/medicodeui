BEGIN;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS account_setup_required boolean NOT NULL DEFAULT false;

UPDATE public.user_roles
SET account_setup_required = false
WHERE onboarding_completed IS TRUE
  AND account_setup_required IS TRUE;

-- Keep a provisioned user's own profile row readable so AuthContext can
-- route them to consent, while denying access to every other RLS-protected
-- public table until consent is saved. Restrictive policies compose with the
-- existing role and tenant policies instead of replacing them.
CREATE OR REPLACE FUNCTION public.can_access_portal_records()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.account_setup_required IS FALSE
        AND lower(coalesce(ur.access_status, '')) = 'active'
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_portal_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_portal_records() TO authenticated, service_role;

DO $$
DECLARE
  v_table record;
  v_policy_name text := 'require_completed_account_setup';
BEGIN
  FOR v_table IN
    SELECT namespace.nspname, relation.relname
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relrowsecurity IS TRUE
      AND relation.relname <> 'user_roles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', v_policy_name, v_table.nspname, v_table.relname);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.can_access_portal_records())) WITH CHECK ((SELECT public.can_access_portal_records()))',
      v_policy_name,
      v_table.nspname,
      v_table.relname
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND relation.relrowsecurity IS TRUE
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS require_completed_account_setup ON storage.objects';
    EXECUTE 'CREATE POLICY require_completed_account_setup ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.can_access_portal_records())) WITH CHECK ((SELECT public.can_access_portal_records()))';
  END IF;
END;
$$;

-- A provisioned user may authenticate only to complete setup. Every role/RLS
-- check remains closed until the user accepts the required policies.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND lower(coalesce(ur.access_status, '')) = 'active'
      AND ur.account_setup_required IS FALSE
      AND (
        ur.role = _role
        OR (
          _role IN ('nurse'::public.app_role, 'utilization_manager'::public.app_role)
          AND ur.role = 'utilization_manager_lead'::public.app_role
        )
        OR (_role = 'nurse'::public.app_role AND ur.role = 'utilization_manager'::public.app_role)
        OR (_role = 'utilization_manager'::public.app_role AND ur.role = 'nurse'::public.app_role)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- user_roles has a legacy self-update policy for onboarding fields. While a
-- staff-provisioned account is awaiting consent, prevent the account holder
-- from editing role, access, hospital assignment, or setup state directly.
CREATE OR REPLACE FUNCTION public.guard_provisioned_account_self_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() = OLD.user_id AND OLD.account_setup_required IS TRUE THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_team_lead IS DISTINCT FROM OLD.is_team_lead
       OR NEW.hospital_id IS DISTINCT FROM OLD.hospital_id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.access_status IS DISTINCT FROM OLD.access_status
       OR NEW.invite_status IS DISTINCT FROM OLD.invite_status
       OR NEW.onboarding_completed IS DISTINCT FROM OLD.onboarding_completed
       OR NEW.onboarding_completed_at IS DISTINCT FROM OLD.onboarding_completed_at
       OR NEW.account_setup_required IS DISTINCT FROM OLD.account_setup_required THEN
      RAISE EXCEPTION 'Account setup can only be completed through the consent flow.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_provisioned_account_self_updates ON public.user_roles;
CREATE TRIGGER guard_provisioned_account_self_updates
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_provisioned_account_self_updates();
REVOKE ALL ON FUNCTION public.guard_provisioned_account_self_updates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_provisioned_account_self_updates() TO service_role;

-- The existing invitation completion RPC is the single source of truth for
-- activation, hospital linking, consent logging, and consuming setup tokens.
-- Clear the setup gate only when that RPC completes the account.
CREATE OR REPLACE FUNCTION public.clear_account_setup_after_invitation_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.account_setup_required IS TRUE
     AND NEW.onboarding_completed IS TRUE
     AND NEW.invite_status = 'completed' THEN
    NEW.account_setup_required := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_account_setup_after_invitation_completion
  ON public.user_roles;
CREATE TRIGGER clear_account_setup_after_invitation_completion
  BEFORE UPDATE OF onboarding_completed, invite_status
  ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_account_setup_after_invitation_completion();

REVOKE ALL ON FUNCTION public.clear_account_setup_after_invitation_completion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_account_setup_after_invitation_completion() TO service_role;

CREATE OR REPLACE FUNCTION public.complete_admin_provisioned_account(
  p_user_id uuid,
  p_full_name text,
  p_hospital_name text DEFAULT NULL
)
RETURNS TABLE(role text, hospital_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, pg_temp
AS $$
DECLARE
  v_role public.app_role;
  v_hospital_id uuid;
  v_hospital_user_id uuid;
  v_email text;
  v_name text := nullif(trim(p_full_name), '');
  v_hospital_name text := nullif(trim(p_hospital_name), '');
BEGIN
  IF p_user_id IS NULL OR v_name IS NULL OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'A valid user and full name are required.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_hospital_name, '')) > 200 THEN
    RAISE EXCEPTION 'Hospital name must be 200 characters or fewer.' USING ERRCODE = '22023';
  END IF;

  SELECT ur.role, ur.hospital_id, lower(trim(ur.email))
    INTO v_role, v_hospital_id, v_email
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id
    AND ur.access_status = 'active'
    AND ur.invite_status = 'pending'
    AND ur.onboarding_completed IS FALSE
    AND ur.account_setup_required IS TRUE
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This account is not awaiting setup.' USING ERRCODE = '22023';
  END IF;

  IF v_role = 'hospital'::public.app_role THEN
    IF v_hospital_id IS NOT NULL THEN
      SELECT hospital.user_id INTO v_hospital_user_id
      FROM public.hospitals hospital
      WHERE hospital.id = v_hospital_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'The assigned hospital could not be found.' USING ERRCODE = '22023';
      END IF;
      IF v_hospital_user_id IS NOT NULL AND v_hospital_user_id <> p_user_id THEN
        RAISE EXCEPTION 'The assigned hospital is already linked to another account.' USING ERRCODE = '23505';
      END IF;
      UPDATE public.hospitals
      SET user_id = p_user_id
      WHERE id = v_hospital_id AND (user_id IS NULL OR user_id = p_user_id);
    ELSE
      IF v_hospital_name IS NULL THEN
        RAISE EXCEPTION 'Hospital name is required to complete this account.' USING ERRCODE = '22023';
      END IF;
      SELECT hospital.id, hospital.user_id INTO v_hospital_id, v_hospital_user_id
      FROM public.hospitals hospital
      WHERE lower(trim(hospital.email)) = v_email
      ORDER BY hospital.created_at
      LIMIT 1
      FOR UPDATE;
      IF FOUND THEN
        IF v_hospital_user_id IS NOT NULL AND v_hospital_user_id <> p_user_id THEN
          RAISE EXCEPTION 'The hospital email is already linked to another account.' USING ERRCODE = '23505';
        END IF;
        UPDATE public.hospitals
        SET name = v_hospital_name, user_id = p_user_id
        WHERE id = v_hospital_id;
      ELSE
        INSERT INTO public.hospitals (name, user_id, email, code)
        VALUES (
          v_hospital_name,
          p_user_id,
          v_email,
          'HOSP-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8))
        )
        RETURNING id INTO v_hospital_id;
      END IF;
    END IF;
  END IF;

  UPDATE public.user_roles
  SET full_name = v_name,
      hospital_id = CASE WHEN v_role = 'hospital'::public.app_role THEN v_hospital_id ELSE hospital_id END,
      onboarding_completed = true,
      onboarding_completed_at = now(),
      invite_status = 'completed'
  WHERE user_id = p_user_id;

  INSERT INTO public.consent_logs (user_id, action, policy_version)
  VALUES (p_user_id, 'accept_all', '2026-07');

  RETURN QUERY SELECT v_role::text, v_hospital_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_admin_provisioned_account(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_admin_provisioned_account(uuid, text, text)
  TO service_role;

COMMIT;
