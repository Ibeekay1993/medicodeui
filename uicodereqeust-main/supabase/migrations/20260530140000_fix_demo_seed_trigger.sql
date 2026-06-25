-- ============================================================
-- Fix: Demo Seed + Trigger Hardening Patch
-- Problem: harden_user_roles trigger blocks ALL inserts when
--          auth.uid() is NULL (service-role / SQL editor context)
--          because has_role(NULL, 'admin') always returns FALSE.
-- Solution: Allow NULL auth.uid() (service-role/postgres context)
--           to bypass the trigger. Also add a UNIQUE(user_id)
--           constraint that heal_hospital_user_link depends on.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Patch harden_user_roles to allow service-role seeding
--    When auth.uid() IS NULL → running as postgres/service_role
--    → allow the operation (migrations, seed scripts)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.harden_user_roles()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow if running as service_role / postgres (no JWT = auth.uid() is NULL)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Otherwise require admin role
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'CyberSecurity Violation: Access Role Modification Denied';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- 2. Add a single-column UNIQUE constraint on user_id
--    The original schema only has UNIQUE(user_id, role).
--    heal_hospital_user_link uses ON CONFLICT (user_id) so
--    this constraint is required for it to work correctly.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_unique;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);

COMMIT;

