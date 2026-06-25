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
    -- If hospital is contesting, allow it
    IF OLD.status IN ('approved', 'partially_approved', 'rejected') AND NEW.status IN ('contested', 'under_contest') THEN
       -- Force under_contest_amount to be correctly calculated
       NEW.under_contest_amount = COALESCE(OLD.total_amount, 0) - COALESCE(OLD.approved_amount, 0);
       NEW.contest_submitted_at = now();
    ELSE
       RAISE EXCEPTION 'Claim is locked after submission';
    END IF;
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

    IF NEW.status = 'rejected' AND OLD.status <> 'rejected' THEN
      NEW.rejected_by = auth.uid();
      NEW.rejected_at = now();
    END IF;

    IF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
      NEW.paid_by = auth.uid();
      NEW.paid_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
