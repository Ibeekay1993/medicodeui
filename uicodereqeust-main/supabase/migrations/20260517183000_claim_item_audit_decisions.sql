ALTER TABLE public.hospital_claims
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS declined_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audit_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS audit_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS audit_note TEXT,
  ADD COLUMN IF NOT EXISTS audited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS audited_at TIMESTAMPTZ;

ALTER TABLE public.hospital_claims DISABLE TRIGGER hospital_claims_updated_at_trigger;

UPDATE public.hospital_claims
SET original_amount = COALESCE(original_amount, total_amount),
    approved_amount = COALESCE(approved_amount, total_amount)
WHERE original_amount IS NULL OR approved_amount IS NULL;

ALTER TABLE public.hospital_claims ENABLE TRIGGER hospital_claims_updated_at_trigger;

DROP POLICY IF EXISTS "Claims can update hospital claims" ON public.hospital_claims;
CREATE POLICY "Claims can update hospital claims"
  ON public.hospital_claims
  FOR UPDATE
  TO authenticated
  USING (
    (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin'))
    AND status IN ('submitted', 'pending', 'under_review', 'approved', 'partially_approved')
  )
  WITH CHECK (
    (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin'))
    AND status IN ('submitted', 'pending', 'under_review', 'approved', 'partially_approved', 'rejected', 'paid')
  );

DROP POLICY IF EXISTS "Hospitals can contest audited claims" ON public.hospital_claims;
CREATE POLICY "Hospitals can contest audited claims"
  ON public.hospital_claims
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'hospital')
    AND status IN ('approved', 'partially_approved', 'rejected')
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hospital')
    AND status = 'contested'
    AND hospital_id IN (SELECT h.id FROM public.hospitals h WHERE h.user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_hospital_claims_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();

  IF NEW.original_amount IS NULL THEN
    NEW.original_amount = OLD.original_amount;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at = now();
  END IF;

  IF OLD.status <> 'draft' AND (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin')) THEN
    IF OLD.status IN ('submitted', 'pending') AND NEW.status NOT IN ('submitted', 'pending', 'under_review', 'approved', 'partially_approved', 'rejected') THEN
      RAISE EXCEPTION 'Submitted claims can only be investigated, approved, partially approved, or rejected';
    END IF;

    IF OLD.status = 'under_review' AND NEW.status NOT IN ('under_review', 'approved', 'partially_approved', 'rejected') THEN
      RAISE EXCEPTION 'Investigated claims can only be approved, partially approved, or rejected';
    END IF;

    IF OLD.status IN ('approved', 'partially_approved') AND NEW.status NOT IN ('approved', 'partially_approved', 'paid', 'rejected') THEN
      RAISE EXCEPTION 'Approved claims can only be paid or rejected';
    END IF;

    IF NEW.status IN ('approved', 'partially_approved', 'rejected') AND OLD.status <> NEW.status THEN
      NEW.approved_by = auth.uid();
      NEW.approved_at = now();
      NEW.audited_by = auth.uid();
      NEW.audited_at = now();
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
  ELSIF OLD.status <> 'draft' THEN
    IF NEW.total_amount <> OLD.total_amount
       OR NEW.line_items IS DISTINCT FROM OLD.line_items
       OR NEW.approved_items IS DISTINCT FROM OLD.approved_items
       OR NEW.audit_items IS DISTINCT FROM OLD.audit_items THEN
      RAISE EXCEPTION 'Submitted billing items cannot be altered by this role';
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
