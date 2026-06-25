BEGIN;

ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS requesting_hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requesting_hospital_name TEXT,
  ADD COLUMN IF NOT EXISTS referring_hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referring_hospital_name TEXT,
  ADD COLUMN IF NOT EXISTS referred_hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_hospital_name TEXT,
  ADD COLUMN IF NOT EXISTS claiming_hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claiming_hospital_name TEXT,
  ADD COLUMN IF NOT EXISTS referral_notes TEXT;

ALTER TABLE public.hospital_claims
  ADD COLUMN IF NOT EXISTS requesting_hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requesting_hospital_name TEXT,
  ADD COLUMN IF NOT EXISTS referring_hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referring_hospital_name TEXT,
  ADD COLUMN IF NOT EXISTS referred_hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_hospital_name TEXT,
  ADD COLUMN IF NOT EXISTS claiming_hospital_id UUID REFERENCES public.hospitals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claiming_hospital_name TEXT;

UPDATE public.authorization_requests
SET
  requesting_hospital_id = COALESCE(requesting_hospital_id, hospital_id),
  requesting_hospital_name = COALESCE(requesting_hospital_name, hospital_name),
  referring_hospital_id = COALESCE(referring_hospital_id, hospital_id),
  referring_hospital_name = COALESCE(referring_hospital_name, hospital_name),
  claiming_hospital_id = COALESCE(claiming_hospital_id, referred_hospital_id, hospital_id),
  claiming_hospital_name = COALESCE(claiming_hospital_name, referred_hospital_name, hospital_name)
WHERE requesting_hospital_id IS NULL
   OR referring_hospital_id IS NULL
   OR claiming_hospital_id IS NULL;

UPDATE public.hospital_claims hc
SET
  requesting_hospital_id = COALESCE(hc.requesting_hospital_id, ar.requesting_hospital_id, ar.hospital_id),
  requesting_hospital_name = COALESCE(hc.requesting_hospital_name, ar.requesting_hospital_name, ar.hospital_name),
  referring_hospital_id = COALESCE(hc.referring_hospital_id, ar.referring_hospital_id, ar.hospital_id),
  referring_hospital_name = COALESCE(hc.referring_hospital_name, ar.referring_hospital_name, ar.hospital_name),
  referred_hospital_id = COALESCE(hc.referred_hospital_id, ar.referred_hospital_id),
  referred_hospital_name = COALESCE(hc.referred_hospital_name, ar.referred_hospital_name),
  claiming_hospital_id = COALESCE(hc.claiming_hospital_id, ar.claiming_hospital_id, ar.referred_hospital_id, hc.hospital_id),
  claiming_hospital_name = COALESCE(hc.claiming_hospital_name, ar.claiming_hospital_name, ar.referred_hospital_name, hc.hospital_name)
FROM public.authorization_requests ar
WHERE ar.id = hc.request_id;

CREATE INDEX IF NOT EXISTS idx_authorization_requests_requesting_hospital_id
  ON public.authorization_requests(requesting_hospital_id);
CREATE INDEX IF NOT EXISTS idx_authorization_requests_referred_hospital_id
  ON public.authorization_requests(referred_hospital_id);
CREATE INDEX IF NOT EXISTS idx_authorization_requests_claiming_hospital_id
  ON public.authorization_requests(claiming_hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospital_claims_claiming_hospital_id
  ON public.hospital_claims(claiming_hospital_id);

DROP POLICY IF EXISTS "Hospital Data Isolation - View" ON public.authorization_requests;
CREATE POLICY "Hospital Data Isolation - View"
  ON public.authorization_requests FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'nurse') OR
    public.has_role(auth.uid(), 'claims') OR
    (
      public.has_role(auth.uid(), 'hospital') AND (
        submitted_by = auth.uid() OR
        hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid()) OR
        requesting_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid()) OR
        referring_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid()) OR
        referred_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid()) OR
        claiming_hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
      )
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
        AND COALESCE(ar.claiming_hospital_id, ar.referred_hospital_id, ar.hospital_id) IN (
          SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid()
        )
        AND COALESCE(ar.claiming_hospital_id, ar.referred_hospital_id, ar.hospital_id) = hospital_id
    )
  );

CREATE OR REPLACE FUNCTION public.set_hospital_claims_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();

  IF NEW.hospital_id <> OLD.hospital_id
     OR NEW.request_id <> OLD.request_id
     OR NEW.auth_code <> OLD.auth_code
     OR NEW.patient_name <> OLD.patient_name
     OR NEW.policy_number <> OLD.policy_number
     OR NEW.diagnosis <> OLD.diagnosis
     OR NEW.approved_for <> OLD.approved_for
     OR NEW.claim_number <> OLD.claim_number
     OR NEW.created_by <> OLD.created_by
     OR NEW.created_at <> OLD.created_at
     OR NEW.claiming_hospital_id IS DISTINCT FROM OLD.claiming_hospital_id
     OR NEW.referred_hospital_id IS DISTINCT FROM OLD.referred_hospital_id
     OR NEW.referring_hospital_id IS DISTINCT FROM OLD.referring_hospital_id
     OR NEW.requesting_hospital_id IS DISTINCT FROM OLD.requesting_hospital_id THEN
    RAISE EXCEPTION 'Core claim fields cannot be changed';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at = now();
  END IF;

  IF OLD.status <> 'draft' AND NOT (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Claim is locked after submission';
  END IF;

  IF OLD.status <> 'draft' AND (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin')) THEN
    IF OLD.status = 'submitted' AND NEW.status NOT IN ('submitted', 'under_review', 'approved', 'rejected', 'partially_approved', 'paid') THEN
      RAISE EXCEPTION 'Submitted claims can only be investigated, approved, paid, or rejected';
    END IF;

    IF OLD.status = 'under_review' AND NEW.status NOT IN ('under_review', 'approved', 'rejected', 'partially_approved', 'paid') THEN
      RAISE EXCEPTION 'Investigated claims can only be approved, paid, or rejected';
    END IF;

    IF OLD.status IN ('approved', 'partially_approved') AND NEW.status NOT IN ('approved', 'partially_approved', 'paid', 'rejected') THEN
      RAISE EXCEPTION 'Approved claims can only be paid or rejected';
    END IF;

    IF NEW.total_amount <> OLD.total_amount OR NEW.approved_items IS DISTINCT FROM OLD.approved_items THEN
      RAISE EXCEPTION 'Claims team cannot alter approved billing items or totals';
    END IF;

    IF NEW.status IN ('approved', 'partially_approved') AND OLD.status NOT IN ('approved', 'partially_approved') THEN
      NEW.approved_by = auth.uid();
      NEW.approved_at = now();
    END IF;

    IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
      IF OLD.status NOT IN ('approved', 'partially_approved') THEN
        RAISE EXCEPTION 'Only approved claims can be paid';
      END IF;
      NEW.paid_by = auth.uid();
      NEW.paid_at = now();
    END IF;

    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'Submitted timestamp cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hospital_claims_updated_at_trigger ON public.hospital_claims;
CREATE TRIGGER hospital_claims_updated_at_trigger
BEFORE UPDATE ON public.hospital_claims
FOR EACH ROW
EXECUTE FUNCTION public.set_hospital_claims_updated_at();

COMMIT;
