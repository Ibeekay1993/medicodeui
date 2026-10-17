-- Per-user MFA enforcement controls
-- Adds an optional mfa_exempt flag on user_roles so admins can bypass
-- MFA requirements for individual users independently of the global policy.
-- Also creates a helper RPC to administratively disable MFA for a single user.

-- 1. Add mfa_exempt column (nullable = not set, true = explicitly exempted from MFA)
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS mfa_exempt BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.user_roles.mfa_exempt IS
  'TRUE = this user is exempt from MFA even if global enforcement is on. FALSE or NULL = follow the global MFA policy.';

-- Keep users from granting themselves an MFA exemption through the existing
-- self-service user_roles update policy.
CREATE OR REPLACE FUNCTION public.harden_user_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND auth.uid() = NEW.user_id THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR
       NEW.access_status IS DISTINCT FROM OLD.access_status OR
       NEW.user_id IS DISTINCT FROM OLD.user_id OR
       NEW.email IS DISTINCT FROM OLD.email OR
       NEW.mfa_exempt IS DISTINCT FROM OLD.mfa_exempt THEN
      IF NOT public.has_role(auth.uid(), 'admin') THEN
        RAISE EXCEPTION 'CyberSecurity Violation: Access Role Modification Denied';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'CyberSecurity Violation: Access Role Modification Denied';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. RPC: admin_set_user_mfa_exempt — toggle per-user MFA exemption
--    p_exempt = TRUE  → exempt user (skip MFA screen even when global is on)
--    p_exempt = FALSE or NULL → follow the global MFA policy
CREATE OR REPLACE FUNCTION public.admin_set_user_mfa_exempt(
  p_user_id UUID,
  p_exempt   BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role public.app_role;
BEGIN
  SELECT role INTO v_caller_role
  FROM public.user_roles
  WHERE user_id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Access Denied: Only admins can manage per-user MFA settings';
  END IF;

  UPDATE public.user_roles
  SET mfa_exempt = p_exempt,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- When exempting a user, also unenroll their existing factors so Supabase
  -- no longer demands aal2 on the next sign-in.
  IF p_exempt IS TRUE THEN
    DELETE FROM auth.mfa_factors  WHERE user_id = p_user_id;
    DELETE FROM auth.mfa_amr_claims
    WHERE session_id IN (
      SELECT id FROM auth.sessions WHERE user_id = p_user_id
    );
  END IF;

  INSERT INTO public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    auth.uid(),
    'ADMIN_SET_MFA_EXEMPTION',
    'user',
    p_user_id,
    jsonb_build_object('target_user_id', p_user_id, 'mfa_exempt', p_exempt)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'mfa_exempt', p_exempt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_mfa_exempt(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_mfa_exempt(UUID, BOOLEAN) TO authenticated;

-- 3. Update admin_get_users_mfa_status to also return mfa_exempt so the
--    front-end can display the per-user setting without a second query.
--    DROP required because PostgreSQL cannot change a function's return type in-place.
DROP FUNCTION IF EXISTS public.admin_get_users_mfa_status();
CREATE OR REPLACE FUNCTION public.admin_get_users_mfa_status()
RETURNS TABLE(
  user_id    UUID,
  mfa_enabled BOOLEAN,
  mfa_exempt  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role public.app_role;
BEGIN
  SELECT role INTO v_caller_role
  FROM public.user_roles
  WHERE user_id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    EXISTS(
      SELECT 1 FROM auth.mfa_factors mf
      WHERE mf.user_id = u.id
        AND mf.status   = 'verified'
    ) AS mfa_enabled,
    ur.mfa_exempt
  FROM auth.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_users_mfa_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_users_mfa_status() TO authenticated;
