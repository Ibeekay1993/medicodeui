-- Harden hospital account provisioning and add real claim storage for the staging hospital portal.

BEGIN;

-- Remove overly broad hospital/public read paths.
DROP POLICY IF EXISTS "Anyone can read active hospitals" ON public.hospitals;
DROP POLICY IF EXISTS "Anon can read active hospitals" ON public.hospitals;

-- Lock role assignment to admins only.
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;
CREATE POLICY "Admins can manage user roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Keep hospitals readable to the owner account or nurses/admins.
DROP POLICY IF EXISTS "Hospitals can view their own record" ON public.hospitals;
CREATE POLICY "Hospitals can view their own record"
  ON public.hospitals
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Nurses can view all hospitals" ON public.hospitals;
CREATE POLICY "Nurses can view all hospitals"
  ON public.hospitals
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Nurses can manage hospitals" ON public.hospitals;
CREATE POLICY "Nurses can manage hospitals"
  ON public.hospitals
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

-- Hospitals can only create their own pending requests and cannot spoof another hospital.
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
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
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
    AND (
      submitted_by = auth.uid()
      OR hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Hospitals can update their own requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can update their own requests"
  ON public.authorization_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND submitted_by = auth.uid()
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND submitted_by = auth.uid()
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Hospitals can delete their own requests" ON public.authorization_requests;
CREATE POLICY "Hospitals can delete their own requests"
  ON public.authorization_requests
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND submitted_by = auth.uid()
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    AND lower(COALESCE(status, 'pending')) = 'pending'
  );

-- Claim storage for staging hospital billing. Duplicate billing is blocked by request_id uniqueness.
CREATE TABLE IF NOT EXISTS public.hospital_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  hospital_name TEXT NOT NULL,
  request_id UUID NOT NULL REFERENCES public.authorization_requests(id) ON DELETE RESTRICT,
  claim_number TEXT NOT NULL UNIQUE,
  auth_code TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  policy_number TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  approved_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.hospital_claim_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.hospital_claims(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  code TEXT NOT NULL,
  units NUMERIC(12,2) NOT NULL DEFAULT 1,
  charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hospital_claims_request_id_key ON public.hospital_claims(request_id);
CREATE INDEX IF NOT EXISTS idx_hospital_claims_hospital_id ON public.hospital_claims(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospital_claims_status ON public.hospital_claims(status);
CREATE INDEX IF NOT EXISTS idx_hospital_claim_lines_claim_id ON public.hospital_claim_lines(claim_id);

ALTER TABLE public.hospital_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_claim_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hospitals can read own claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can read own claims"
  ON public.hospital_claims
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
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
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    AND hospital_name = (
      SELECT h.name
      FROM public.hospitals h
      WHERE h.id = hospital_id
    )
    AND request_id IN (
      SELECT ar.id
      FROM public.authorization_requests ar
      WHERE ar.status = 'approved'
        AND ar.hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Hospitals can update own draft claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can update own draft claims"
  ON public.hospital_claims
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    AND status = 'draft'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    AND status IN ('draft', 'submitted')
  );

DROP POLICY IF EXISTS "Hospitals can delete own draft claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can delete own draft claims"
  ON public.hospital_claims
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    AND status = 'draft'
  );

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
        AND hc.hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
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
        AND hc.hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
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
        AND hc.hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.hospital_claims hc
      WHERE hc.id = claim_id
        AND hc.status = 'draft'
        AND hc.hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
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
        AND hc.hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.set_hospital_claims_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  IF OLD.status = 'draft' AND NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at = now();
  END IF;

  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Claim is locked after submission';
  END IF;

  IF NEW.hospital_id <> OLD.hospital_id
     OR NEW.request_id <> OLD.request_id
     OR NEW.auth_code <> OLD.auth_code
     OR NEW.patient_name <> OLD.patient_name
     OR NEW.policy_number <> OLD.policy_number
     OR NEW.diagnosis <> OLD.diagnosis
     OR NEW.approved_for <> OLD.approved_for
     OR NEW.claim_number <> OLD.claim_number
     OR NEW.created_by <> OLD.created_by
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Core claim fields cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hospital_claims_updated_at_trigger ON public.hospital_claims;
CREATE TRIGGER hospital_claims_updated_at_trigger
BEFORE UPDATE ON public.hospital_claims
FOR EACH ROW
EXECUTE FUNCTION public.set_hospital_claims_updated_at();

CREATE OR REPLACE FUNCTION public.set_hospital_claim_lines_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.claim_id <> OLD.claim_id THEN
    RAISE EXCEPTION 'Claim line cannot be moved to another claim';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.hospital_claims hc
    WHERE hc.id = NEW.claim_id
      AND hc.status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'Claim lines are locked after submission';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hospital_claim_lines_updated_at_trigger ON public.hospital_claim_lines;
CREATE TRIGGER hospital_claim_lines_updated_at_trigger
BEFORE UPDATE ON public.hospital_claim_lines
FOR EACH ROW
EXECUTE FUNCTION public.set_hospital_claim_lines_updated_at();

CREATE OR REPLACE FUNCTION public.refresh_hospital_claim_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_claim_id UUID;
BEGIN
  v_claim_id := COALESCE(NEW.claim_id, OLD.claim_id);
  UPDATE public.hospital_claims hc
  SET total_amount = COALESCE((
    SELECT SUM(hcl.units * hcl.charge)
    FROM public.hospital_claim_lines hcl
    WHERE hcl.claim_id = v_claim_id
  ), 0),
  updated_at = now()
  WHERE hc.id = v_claim_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS hospital_claim_lines_total_insert_trigger ON public.hospital_claim_lines;
CREATE TRIGGER hospital_claim_lines_total_insert_trigger
AFTER INSERT ON public.hospital_claim_lines
FOR EACH ROW
EXECUTE FUNCTION public.refresh_hospital_claim_total();

DROP TRIGGER IF EXISTS hospital_claim_lines_total_update_trigger ON public.hospital_claim_lines;
CREATE TRIGGER hospital_claim_lines_total_update_trigger
AFTER UPDATE ON public.hospital_claim_lines
FOR EACH ROW
EXECUTE FUNCTION public.refresh_hospital_claim_total();

DROP TRIGGER IF EXISTS hospital_claim_lines_total_delete_trigger ON public.hospital_claim_lines;
CREATE TRIGGER hospital_claim_lines_total_delete_trigger
AFTER DELETE ON public.hospital_claim_lines
FOR EACH ROW
EXECUTE FUNCTION public.refresh_hospital_claim_total();

COMMIT;
