-- Security and Fraud Prevention: Enforce database-level rules to prevent double payments, tampering, and auditing mistakes

-- Trigger function for payment_batches table
CREATE OR REPLACE FUNCTION public.enforce_payment_batch_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent deletion of paid batches
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'paid' THEN
      RAISE EXCEPTION 'Safety Violation: A paid payment batch cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  -- Prevent reverting a paid batch
  IF OLD.status = 'paid' AND NEW.status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Safety Violation: A settled (paid) batch cannot be reverted back to draft or ready status.';
  END IF;

  -- Prevent modification of key details once paid
  IF OLD.status = 'paid' THEN
    IF NEW.provider_id IS DISTINCT FROM OLD.provider_id OR
       NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
       NEW.batch_reference IS DISTINCT FROM OLD.batch_reference THEN
      RAISE EXCEPTION 'Safety Violation: Core financial details of a settled (paid) batch cannot be modified.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to payment_batches
DROP TRIGGER IF EXISTS trigger_enforce_payment_batch_immutability ON public.payment_batches;
CREATE TRIGGER trigger_enforce_payment_batch_immutability
  BEFORE UPDATE OR DELETE ON public.payment_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payment_batch_immutability();


-- Trigger function for hospital_claims table to prevent double payment and tampering
CREATE OR REPLACE FUNCTION public.prevent_claim_payment_fraud()
RETURNS TRIGGER AS $$
DECLARE
  linked_batch_status TEXT;
BEGIN
  -- 1. Prevent modification/unbatching of already paid claims
  IF OLD.payment_status = 'paid' OR OLD.status = 'paid' THEN
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
       NEW.payment_batch_id IS DISTINCT FROM OLD.payment_batch_id OR
       NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Safety Violation: Already paid/settled claims cannot be modified, unbatched, or reverted.';
    END IF;
  END IF;

  -- 2. Prevent assigning a claim to a new batch if it is already in an active batch
  IF NEW.payment_batch_id IS NOT NULL AND 
     OLD.payment_batch_id IS NOT NULL AND 
     NEW.payment_batch_id IS DISTINCT FROM OLD.payment_batch_id THEN
    RAISE EXCEPTION 'Double Payment Prevention: This claim is already assigned to batch %. You must cancel the existing batch first.', 
      (SELECT batch_reference FROM public.payment_batches WHERE id = OLD.payment_batch_id);
  END IF;

  -- 3. Verify batch status rules when transition to paid occurs
  IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status IS DISTINCT FROM 'paid') THEN
    -- Must have a batch ID
    IF NEW.payment_batch_id IS NULL THEN
      RAISE EXCEPTION 'Audit Constraint: A claim cannot be marked paid directly without being part of a payment batch.';
    END IF;

    -- Fetch the batch status
    SELECT status INTO linked_batch_status 
      FROM public.payment_batches 
     WHERE id = NEW.payment_batch_id;

    -- Batch must also be paid or being updated to paid
    IF linked_batch_status IS DISTINCT FROM 'paid' THEN
      RAISE EXCEPTION 'Audit Constraint: A claim can only be marked paid if its associated payment batch is also settled (paid).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to hospital_claims
DROP TRIGGER IF EXISTS trigger_prevent_claim_payment_fraud ON public.hospital_claims;
CREATE TRIGGER trigger_prevent_claim_payment_fraud
  BEFORE UPDATE ON public.hospital_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_claim_payment_fraud();
