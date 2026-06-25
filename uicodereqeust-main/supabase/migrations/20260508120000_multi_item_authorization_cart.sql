-- Multi-item authorization cart for staging.
-- Nurses approve treatment/service/drug items only. Hospitals claim approved authorizations later.

BEGIN;

ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS approved_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.hospital_claims
  ADD COLUMN IF NOT EXISTS approved_items JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_authorization_requests_approved_items
  ON public.authorization_requests USING gin(approved_items);

-- Replace the claim update guard so claim totals can be refreshed from locked claim lines,
-- while hospitals still cannot change submitted claims and claims staff cannot alter core billing.
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
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Core claim fields cannot be changed';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'submitted' AND NEW.submitted_at IS NULL THEN
    NEW.submitted_at = now();
  END IF;

  IF OLD.status <> 'draft' AND NOT public.has_role(auth.uid(), 'claims') THEN
    RAISE EXCEPTION 'Claim is locked after submission';
  END IF;

  IF OLD.status <> 'draft' AND public.has_role(auth.uid(), 'claims') THEN
    IF OLD.status = 'submitted' AND NEW.status NOT IN ('submitted', 'under_review', 'approved', 'rejected') THEN
      RAISE EXCEPTION 'Submitted claims can only be investigated, approved, or rejected';
    END IF;

    IF OLD.status = 'under_review' AND NEW.status NOT IN ('under_review', 'approved', 'rejected') THEN
      RAISE EXCEPTION 'Investigated claims can only be approved or rejected';
    END IF;

    IF OLD.status = 'approved' AND NEW.status NOT IN ('approved', 'paid', 'rejected') THEN
      RAISE EXCEPTION 'Approved claims can only be paid or rejected';
    END IF;

    IF NEW.total_amount <> OLD.total_amount OR NEW.approved_items IS DISTINCT FROM OLD.approved_items THEN
      RAISE EXCEPTION 'Claims team cannot alter approved billing items or totals';
    END IF;

    IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
      NEW.approved_by = auth.uid();
      NEW.approved_at = now();
    END IF;

    IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
      IF OLD.status <> 'approved' THEN
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
