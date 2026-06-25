-- ─────────────────────────────────────────────────────────
-- 1. Backfill hospital_id in user_roles for existing users
-- ─────────────────────────────────────────────────────────
UPDATE public.user_roles ur
SET hospital_id = h.id
FROM public.hospitals h
WHERE ur.role = 'hospital'
  AND ur.user_id = h.user_id
  AND ur.hospital_id IS NULL;

-- ─────────────────────────────────────────────────────────
-- 2. Update heal_hospital_user_link function to set hospital_id
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
  v_hospital      RECORD;
  v_existing      RECORD;
  v_hospital_name TEXT;
  v_hospital_id   UUID;
BEGIN
  -- ── Step 1: Check if user already has a role ──────────────
  SELECT ur.role::TEXT, ur.full_name, ur.hospital_id
  INTO v_existing
  FROM public.user_roles ur
  WHERE ur.user_id = p_user_id;

  IF FOUND THEN
    -- Role exists. If hospital, ensure the hospital row is linked.
    IF v_existing.role = 'hospital' THEN
      SELECT h.id, h.name INTO v_hospital_id, v_hospital_name
      FROM public.hospitals h
      WHERE h.user_id = p_user_id OR h.email = p_email
      LIMIT 1;

      -- Link hospital row in case it was never linked
      IF v_hospital_id IS NOT NULL THEN
        UPDATE public.hospitals h
        SET user_id = p_user_id
        WHERE h.id = v_hospital_id
          AND (h.user_id IS NULL OR h.user_id = p_user_id);

        -- Also ensure user_roles has the hospital_id
        IF v_existing.hospital_id IS NULL THEN
          UPDATE public.user_roles ur
          SET hospital_id = v_hospital_id
          WHERE ur.user_id = p_user_id;
        END IF;
      END IF;

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
  INSERT INTO public.user_roles (user_id, role, full_name, hospital_id)
  VALUES (p_user_id, 'hospital', v_hospital.name, v_hospital.id)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        hospital_id = COALESCE(public.user_roles.hospital_id, EXCLUDED.hospital_id);

  -- ── Step 4: Link hospitals.user_id → this auth user ──────────
  UPDATE public.hospitals
  SET user_id = p_user_id
  WHERE id = v_hospital.id;

  RETURN QUERY SELECT 'hospital'::TEXT, v_hospital.name;
END;
$$;

-- Allow any authenticated user to call this function
GRANT EXECUTE ON FUNCTION public.heal_hospital_user_link(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────
-- 3. Update RLS policies for hospitals table
-- ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Hospitals can view their own record" ON public.hospitals;
CREATE POLICY "Hospitals can view their own record"
  ON public.hospitals
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR id IN (
      SELECT hospital_id 
      FROM public.user_roles 
      WHERE user_id = auth.uid() 
        AND role = 'hospital'
    )
  );

-- ─────────────────────────────────────────────────────────
-- 4. Update RLS policies for authorization_requests
-- ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Hospitals can create pending requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can create pending requests"
  ON public.authorization_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND submitted_by = auth.uid()
    AND status = 'pending'
    AND hospital_id IS NOT NULL
    AND hospital_id IN (
      SELECT ur.hospital_id 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
    )
    AND hospital_name = (
      SELECT h.name
      FROM public.hospitals h
      WHERE h.id = hospital_id
    )
    AND COALESCE(authorization_code, '') = ''
  );

DROP POLICY IF EXISTS "Hospitals can view their own requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can view their own requests"
  ON public.authorization_requests
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (
      SELECT ur.hospital_id 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
    )
  );

DROP POLICY IF EXISTS "Hospitals can update their own requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can update their own requests"
  ON public.authorization_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (
      SELECT ur.hospital_id 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (
      SELECT ur.hospital_id 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
    )
  );

DROP POLICY IF EXISTS "Hospitals can delete their own requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can delete their own requests"
  ON public.authorization_requests
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (
      SELECT ur.hospital_id 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
    )
    AND lower(COALESCE(status, 'pending')) = 'pending'
  );

-- ─────────────────────────────────────────────────────────
-- 5. Update RLS policies for hospital_claims
-- ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Hospitals can read own claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can read own claims"
  ON public.hospital_claims
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (
      SELECT ur.hospital_id 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
    )
  );

DROP POLICY IF EXISTS "Hospitals can create own claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can create own claims"
  ON public.hospital_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND created_by = auth.uid()
    AND status = 'draft'
    AND hospital_id IN (
      SELECT ur.hospital_id 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
    )
    AND hospital_name = (
      SELECT h.name
      FROM public.hospitals h
      WHERE h.id = hospital_id
    )
    AND request_id IN (
      SELECT ar.id
      FROM public.authorization_requests ar
      WHERE ar.status = 'approved'
        AND ar.hospital_id IN (
          SELECT ur.hospital_id 
          FROM public.user_roles ur 
          WHERE ur.user_id = auth.uid() 
            AND ur.role = 'hospital'
        )
    )
  );

DROP POLICY IF EXISTS "Hospitals can update own draft claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can update own draft claims"
  ON public.hospital_claims
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (
      SELECT ur.hospital_id 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
    )
    AND status = 'draft'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (
      SELECT ur.hospital_id 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
    )
    AND status IN ('draft', 'submitted')
  );

DROP POLICY IF EXISTS "Hospitals can delete own draft claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can delete own draft claims"
  ON public.hospital_claims
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (
      SELECT ur.hospital_id 
      FROM public.user_roles ur 
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'hospital'
    )
    AND status = 'draft'
  );

-- ─────────────────────────────────────────────────────────
-- 6. Update RLS policies for hospital_claim_lines
-- ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Hospitals can read own claim lines" ON public.hospital_claim_lines;
CREATE POLICY "Hospitals can read own claim lines"
  ON public.hospital_claim_lines
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.hospital_claims hc
      WHERE hc.id = claim_id
        AND hc.hospital_id IN (
          SELECT ur.hospital_id 
          FROM public.user_roles ur 
          WHERE ur.user_id = auth.uid() 
            AND ur.role = 'hospital'
        )
    )
  );

DROP POLICY IF EXISTS "Hospitals can create own claim lines" ON public.hospital_claim_lines;
CREATE POLICY "Hospitals can create own claim lines"
  ON public.hospital_claim_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.hospital_claims hc
      WHERE hc.id = claim_id
        AND hc.status = 'draft'
        AND hc.hospital_id IN (
          SELECT ur.hospital_id 
          FROM public.user_roles ur 
          WHERE ur.user_id = auth.uid() 
            AND ur.role = 'hospital'
        )
    )
  );

DROP POLICY IF EXISTS "Hospitals can update own claim lines" ON public.hospital_claim_lines;
CREATE POLICY "Hospitals can update own claim lines"
  ON public.hospital_claim_lines
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.hospital_claims hc
      WHERE hc.id = claim_id
        AND hc.status = 'draft'
        AND hc.hospital_id IN (
          SELECT ur.hospital_id 
          FROM public.user_roles ur 
          WHERE ur.user_id = auth.uid() 
            AND ur.role = 'hospital'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.hospital_claims hc
      WHERE hc.id = claim_id
        AND hc.status = 'draft'
        AND hc.hospital_id IN (
          SELECT ur.hospital_id 
          FROM public.user_roles ur 
          WHERE ur.user_id = auth.uid() 
            AND ur.role = 'hospital'
        )
    )
  );

DROP POLICY IF EXISTS "Hospitals can delete own claim lines" ON public.hospital_claim_lines;
CREATE POLICY "Hospitals can delete own claim lines"
  ON public.hospital_claim_lines
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.hospital_claims hc
      WHERE hc.id = claim_id
        AND hc.status = 'draft'
        AND hc.hospital_id IN (
          SELECT ur.hospital_id 
          FROM public.user_roles ur 
          WHERE ur.user_id = auth.uid() 
            AND ur.role = 'hospital'
        )
    )
  );
