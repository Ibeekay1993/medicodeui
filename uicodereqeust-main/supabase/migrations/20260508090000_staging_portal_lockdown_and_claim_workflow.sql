-- Staging portal lockdown support:
-- - Persist the nurse-selected NHIA tariff on approved authorizations.
-- - Add an explicit claims approval step before payment.
-- - Keep hospital claims locked after submission and preserve one-claim-per-auth.

BEGIN;

DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
CREATE POLICY "Users can read own role"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS approved_tariff_code TEXT,
  ADD COLUMN IF NOT EXISTS approved_tariff_name TEXT,
  ADD COLUMN IF NOT EXISTS approved_tariff_category TEXT,
  ADD COLUMN IF NOT EXISTS approved_tariff_amount NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_authorization_requests_approved_tariff_code
  ON public.authorization_requests(approved_tariff_code);

ALTER TABLE public.hospital_claims
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_note TEXT;

DROP POLICY IF EXISTS "Claims can update hospital claims" ON public.hospital_claims;
CREATE POLICY "Claims can update hospital claims"
  ON public.hospital_claims
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'claims')
    AND status IN ('submitted', 'under_review', 'approved')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'claims')
    AND status IN ('under_review', 'approved', 'paid', 'rejected')
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
     OR NEW.total_amount <> OLD.total_amount THEN
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
