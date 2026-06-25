-- Add claims role support and tighten claim-status handling for the staging hospital portal.

BEGIN;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'claims';

COMMIT;

BEGIN;

DROP POLICY IF EXISTS "Claims can read hospital claims" ON public.hospital_claims;
CREATE POLICY "Claims can read hospital claims"
  ON public.hospital_claims
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'claims'));

DROP POLICY IF EXISTS "Claims can update hospital claims" ON public.hospital_claims;
CREATE POLICY "Claims can update hospital claims"
  ON public.hospital_claims
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'claims')
    AND status IN ('submitted', 'under_review')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'claims')
    AND status IN ('under_review', 'paid', 'rejected')
  );

DROP POLICY IF EXISTS "Claims can read hospital claim lines" ON public.hospital_claim_lines;
CREATE POLICY "Claims can read hospital claim lines"
  ON public.hospital_claim_lines
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.hospital_claims hc
      WHERE hc.id = claim_id
        AND public.has_role(auth.uid(), 'claims')
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
    IF NEW.status NOT IN ('submitted', 'under_review', 'paid', 'rejected') THEN
      RAISE EXCEPTION 'Claims team can only move claims through review statuses';
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
