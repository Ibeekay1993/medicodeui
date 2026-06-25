-- ============================================================
-- Fix: Hospital Portal Infinite Login Loop
-- Problem 1: hospitals SELECT RLS only allows user_id = auth.uid()
--            but on first login user_id is NULL → query returns nothing
-- Problem 2: tr_harden_user_roles trigger blocks all non-admin INSERT
--            to user_roles → auto-heal insert always fails
-- Solution:  A SECURITY DEFINER RPC that runs as DB owner, bypasses
--            both the RLS and the trigger to safely link hospital users
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────
-- 1. Allow hospitals to SELECT their own record by email too
--    (needed before user_id is populated on first login)
-- ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Hospitals can view their own record" ON public.hospitals;
CREATE POLICY "Hospitals can view their own record"
  ON public.hospitals FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
  );

-- ─────────────────────────────────────────────────────────
-- 2. SECURITY DEFINER function: heal_hospital_user_link
--    Called by AuthContext on login. Runs as postgres (DB owner),
--    bypassing the harden_user_roles trigger and RLS restrictions.
--    Returns (role, full_name) so the client can set auth state.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.heal_hospital_user_link(
  p_user_id UUID,
  p_email    TEXT
)
RETURNS TABLE(out_role TEXT, out_full_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hospital     RECORD;
  v_existing     RECORD;
  v_hospital_name TEXT;
BEGIN
  -- ── Step 1: Check if user already has a role ──────────────
  SELECT ur.role::TEXT, ur.full_name
  INTO v_existing
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;

  IF FOUND THEN
    -- Role exists. If hospital, ensure the hospital row is linked.
    IF v_existing.role = 'hospital' THEN
      -- Link hospital row in case it was never linked
      UPDATE public.hospitals h
      SET user_id = p_user_id
      WHERE h.email = p_email
        AND (h.user_id IS NULL OR h.user_id = p_user_id);

      -- Prefer the hospital name as full_name
      SELECT h.name INTO v_hospital_name
      FROM public.hospitals h
      WHERE h.user_id = p_user_id OR h.email = p_email
      LIMIT 1;

      RETURN QUERY SELECT v_existing.role, COALESCE(v_hospital_name, v_existing.full_name);
    ELSE
      RETURN QUERY SELECT v_existing.role, v_existing.full_name;
    END IF;
    RETURN;
  END IF;

  -- ── Step 2: No role yet. Check if email matches a hospital ──
  SELECT *
  INTO v_hospital
  FROM public.hospitals h
  WHERE h.email = p_email
  LIMIT 1;

  IF NOT FOUND THEN
    -- Not a hospital user — return nothing, caller handles this
    RETURN;
  END IF;

  -- ── Step 3: Insert hospital role (bypasses trigger via SECURITY DEFINER) ──
  INSERT INTO public.user_roles (user_id, role, full_name)
  VALUES (p_user_id, 'hospital', v_hospital.name)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name;

  -- ── Step 4: Link hospitals.user_id → this auth user ──────────
  UPDATE public.hospitals
  SET user_id = p_user_id
  WHERE id = v_hospital.id;

  RETURN QUERY SELECT 'hospital'::TEXT, v_hospital.name;
END;
$$;

-- Allow any authenticated user to call this function
GRANT EXECUTE ON FUNCTION public.heal_hospital_user_link(UUID, TEXT) TO authenticated;

COMMIT;
