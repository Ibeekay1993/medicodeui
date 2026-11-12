-- ============================================================================
-- Two integrity gaps found in the security audit (2026-11-12)
--
-- 1. hospitals: policy "hospitals can update their own record" has no column
--    limit, so a hospital user could set is_active = true after an administrator
--    suspended the hospital (the edge function auth helper trusts is_active),
--    or change its code, e-mail or WhatsApp number.
-- 2. audit_logs: policy "authenticated can insert audit logs" only checks that
--    the caller is signed in, so any user could write log rows attributed to
--    someone else.
--
-- Staff (admin, nurse and the utilization roles that has_role maps to nurse)
-- keep full control. The service role (auth.uid() IS NULL) is unaffected.
-- Safe to re-run.
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.protect_hospital_self_service_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Hospital-management RLS currently grants nurses/utilization managers
  -- broad UPDATE access. They may edit ordinary fields, but must not bypass
  -- the protected-column guard below.
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
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
  BEFORE UPDATE OF is_active, code, email, whatsapp_number ON public.hospitals
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

DROP TRIGGER IF EXISTS force_audit_log_author ON public.audit_logs;
CREATE TRIGGER force_audit_log_author
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.force_audit_log_author();

COMMIT;
