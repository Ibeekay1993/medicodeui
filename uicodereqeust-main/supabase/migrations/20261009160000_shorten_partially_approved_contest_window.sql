-- Shorten contest dispute window for partially approved claims from 30 days to 7 days,
-- enable immediate release to payment, and reconcile existing partially approved claims.

CREATE OR REPLACE FUNCTION public.handle_claim_status_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-advance to awaiting_payment when status changes to approved
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    NEW.payment_status := 'awaiting_payment';
  END IF;

  -- Set contest deadline or auto-advance when status changes to partially_approved
  IF NEW.status = 'partially_approved' AND (OLD.status IS NULL OR OLD.status != 'partially_approved') THEN
    IF OLD.status IN ('contested', 'under_contest') THEN
      -- Contest resolved/modified: immediately move to awaiting_payment
      NEW.payment_status := 'awaiting_payment';
      NEW.contest_deadline := LEAST(COALESCE(NEW.contest_deadline, NOW()), NOW());
    ELSE
      -- First time partially approved: start 7-day contest clock (reduced from 30 days)
      NEW.contest_deadline := NOW() + INTERVAL '7 days';
    END IF;
  END IF;

  -- If payment_status is explicitly set to awaiting_payment on a partially_approved claim,
  -- expire/clear the contest deadline so it is immediately batchable
  IF NEW.status = 'partially_approved' AND NEW.payment_status = 'awaiting_payment' THEN
    NEW.contest_deadline := LEAST(COALESCE(NEW.contest_deadline, NOW()), NOW());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC to allow Admins, Claims officers, Finance officers, or the claiming hospital
-- to accept/release a partially approved claim immediately to awaiting_payment
CREATE OR REPLACE FUNCTION public.release_claim_to_payment(p_claim_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_role app_role;
  v_hospital_id UUID;
BEGIN
  SELECT role, hospital_id INTO v_role, v_hospital_id
  FROM public.user_roles
  WHERE user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Access Denied: Unassigned Role';
  END IF;

  SELECT * INTO v_claim
  FROM public.hospital_claims
  WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  -- Check authorization: backoffice roles OR owning hospital
  IF v_role NOT IN ('admin', 'claims', 'finance') THEN
    IF v_role = 'hospital' AND v_claim.hospital_id = v_hospital_id THEN
      -- Hospital accepting partial approval
      NULL;
    ELSE
      RAISE EXCEPTION 'Unauthorized to release this claim to payment';
    END IF;
  END IF;

  IF v_claim.status NOT IN ('approved', 'partially_approved') THEN
    RAISE EXCEPTION 'Only approved or partially approved claims can be released to payment';
  END IF;

  UPDATE public.hospital_claims
  SET 
    payment_status = 'awaiting_payment',
    contest_deadline = LEAST(COALESCE(contest_deadline, NOW()), NOW()),
    updated_at = NOW()
  WHERE id = p_claim_id;

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', p_claim_id,
    'payment_status', 'awaiting_payment'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_claim_to_payment(UUID) TO authenticated;

-- Backfill / Reconcile existing partially approved claims:
-- 1. Claims whose contest deadline has already passed, or which were created > 7 days ago
UPDATE public.hospital_claims
SET 
  payment_status = 'awaiting_payment',
  contest_deadline = LEAST(COALESCE(contest_deadline, NOW()), NOW())
WHERE status = 'partially_approved'
  AND (payment_status IS NULL OR payment_status != 'awaiting_payment')
  AND (
    (contest_deadline IS NOT NULL AND contest_deadline <= NOW())
    OR (created_at < NOW() - INTERVAL '7 days')
  );

-- 2. Shorten any remaining claims currently stuck in a 30-day contest deadline down to created_at + 7 days
UPDATE public.hospital_claims
SET contest_deadline = created_at + INTERVAL '7 days'
WHERE status = 'partially_approved'
  AND (payment_status IS NULL OR payment_status != 'awaiting_payment')
  AND contest_deadline > created_at + INTERVAL '7 days';

-- 3. Any claims whose newly adjusted contest_deadline is now in the past, move to awaiting_payment
UPDATE public.hospital_claims
SET 
  payment_status = 'awaiting_payment',
  contest_deadline = NOW()
WHERE status = 'partially_approved'
  AND (payment_status IS NULL OR payment_status != 'awaiting_payment')
  AND contest_deadline <= NOW();
