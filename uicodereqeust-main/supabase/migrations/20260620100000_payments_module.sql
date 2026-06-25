-- Step 2: Add columns to public.hospital_claims
ALTER TABLE public.hospital_claims ADD COLUMN IF NOT EXISTS contest_deadline TIMESTAMPTZ;
ALTER TABLE public.hospital_claims ADD COLUMN IF NOT EXISTS payment_batch_id UUID;
ALTER TABLE public.hospital_claims ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';

-- Step 3: Create payment_batches table
CREATE TABLE IF NOT EXISTS public.payment_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_reference TEXT UNIQUE NOT NULL,
    provider_id UUID REFERENCES public.hospitals(id) ON DELETE RESTRICT NOT NULL,
    month TEXT NOT NULL,
    total_claims INTEGER DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    status TEXT DEFAULT 'draft',
    bank_reference TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    paid_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    paid_at TIMESTAMPTZ
);

-- Step 4: Add foreign key constraint to hospital_claims
ALTER TABLE public.hospital_claims 
  DROP CONSTRAINT IF EXISTS hospital_claims_payment_batch_id_fkey,
  ADD CONSTRAINT hospital_claims_payment_batch_id_fkey 
  FOREIGN KEY (payment_batch_id) REFERENCES public.payment_batches(id) ON DELETE SET NULL;

-- Step 5: Enable RLS on payment_batches
ALTER TABLE public.payment_batches ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for payment_batches
DROP POLICY IF EXISTS "Backoffice users can view payment batches" ON public.payment_batches;
CREATE POLICY "Backoffice users can view payment batches"
  ON public.payment_batches FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'claims') OR
    public.has_role(auth.uid(), 'finance')
  );

DROP POLICY IF EXISTS "Backoffice users can manage payment batches" ON public.payment_batches;
CREATE POLICY "Backoffice users can manage payment batches"
  ON public.payment_batches FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'finance')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'finance')
  );

-- Step 7: Create trigger to automatically set status on approved claims and deadline on partial approvals
CREATE OR REPLACE FUNCTION public.handle_claim_status_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-advance to awaiting_payment when status changes to approved
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    NEW.payment_status := 'awaiting_payment';
  END IF;

  -- Set contest deadline when status changes to partially_approved
  IF NEW.status = 'partially_approved' AND (OLD.status IS NULL OR OLD.status != 'partially_approved') THEN
    NEW.contest_deadline := NOW() + INTERVAL '30 days';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_claim_status_changes ON public.hospital_claims;
CREATE TRIGGER trigger_claim_status_changes
  BEFORE INSERT OR UPDATE ON public.hospital_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_claim_status_changes();

-- Step 8: Fix the existing trigger set_hospital_claims_updated_at to support the finance role and transition changes
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

  IF OLD.status <> 'draft' AND NOT (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance')) THEN
    RAISE EXCEPTION 'Claim is locked after submission';
  END IF;

  IF OLD.status <> 'draft' AND (public.has_role(auth.uid(), 'claims') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance')) THEN
    IF OLD.status = 'submitted' AND NEW.status NOT IN ('submitted', 'under_review', 'approved', 'rejected', 'partially_approved', 'paid') THEN
      RAISE EXCEPTION 'Submitted claims can only be investigated, approved, paid, or rejected';
    END IF;

    IF OLD.status = 'under_review' AND NEW.status NOT IN ('under_review', 'approved', 'rejected', 'partially_approved', 'paid') THEN
      RAISE EXCEPTION 'Investigated claims can only be approved, paid, or rejected';
    END IF;

    IF OLD.status IN ('approved', 'partially_approved') AND NEW.status NOT IN ('approved', 'partially_approved', 'paid', 'rejected') THEN
      RAISE EXCEPTION 'Approved claims can only be paid or rejected';
    END IF;

    -- FIX: Only prevent altering totals if the claim was ALREADY approved/partially approved
    IF OLD.status IN ('approved', 'partially_approved') THEN
      IF NEW.total_amount <> OLD.total_amount OR NEW.approved_items IS DISTINCT FROM OLD.approved_items THEN
        RAISE EXCEPTION 'Claims team cannot alter approved billing items or totals';
      END IF;
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
