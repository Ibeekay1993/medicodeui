-- Follow-up hardening for the production security review.
-- Corrects tenant ownership and staff-access gaps without rewriting earlier
-- migration versions that may already be recorded by a deployment.
BEGIN;

CREATE OR REPLACE FUNCTION public.protect_user_role_tenant_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'An authenticated user identity is required to update user role assignments.'
      USING ERRCODE = '42501';
  END IF;

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

CREATE OR REPLACE FUNCTION public.protect_hospital_self_service_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'An authenticated user identity is required to update hospital records.'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Hospital-management RLS gives nurses and utilization managers broad
  -- UPDATE access, so preserve that existing staff capability.
  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'nurse'::public.app_role) THEN
    RETURN NEW;
  END IF;

  -- Permit only the verified first-time link used by heal_hospital_user_link.
  -- A hospital account cannot reassign a linked row or claim another account.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     AND NOT (
       OLD.user_id IS NULL
       AND NEW.user_id = auth.uid()
       AND lower(trim(coalesce(OLD.email, ''))) <> ''
       AND lower(trim(coalesce(auth.jwt() ->> 'email', ''))) <> ''
       AND lower(trim(OLD.email)) = lower(trim(auth.jwt() ->> 'email'))
     ) THEN
    RAISE EXCEPTION 'Hospital account assignment can only be changed by staff or verified first-time linking.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.code IS DISTINCT FROM OLD.code
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.whatsapp_number IS DISTINCT FROM OLD.whatsapp_number THEN
    RAISE EXCEPTION 'Hospital status, code, e-mail and WhatsApp number can only be changed by staff.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_hospital_self_service_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_hospital_self_service_columns() TO service_role;

DROP TRIGGER IF EXISTS protect_hospital_self_service_columns ON public.hospitals;
CREATE TRIGGER protect_hospital_self_service_columns
  BEFORE UPDATE OF user_id, is_active, code, email, whatsapp_number ON public.hospitals
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_hospital_self_service_columns();

CREATE OR REPLACE FUNCTION public.force_audit_log_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_name TEXT;
  v_actor_role TEXT;
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'An authenticated user identity is required to create audit records.'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT ur.full_name, ur.role::TEXT
      INTO v_actor_name, v_actor_role
    FROM public.user_roles AS ur
    WHERE ur.user_id = auth.uid()
    LIMIT 1;

    NEW.user_id := auth.uid();
    NEW.actor_user_id := auth.uid();
    NEW.actor_name := COALESCE(v_actor_name, 'Authenticated user');
    NEW.actor_role := COALESCE(v_actor_role, 'authenticated');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.force_audit_log_author() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_audit_log_author() TO service_role;

COMMIT;
