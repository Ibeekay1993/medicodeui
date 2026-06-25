-- Redefine handle_claim_status_changes trigger to handle contest resolutions
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
    ELSE
      -- First time partially approved: start 30-day contest clock
      NEW.contest_deadline := NOW() + INTERVAL '30 days';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
