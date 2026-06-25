-- Temporarily disable user triggers to bypass post-submission update locks during migration
ALTER TABLE public.hospital_claims DISABLE TRIGGER USER;

-- Backfill payment_status for claims already approved before trigger deployment
UPDATE public.hospital_claims 
SET payment_status = 'awaiting_payment' 
WHERE status = 'approved' 
  AND (payment_status IS NULL OR payment_status = 'unpaid');

-- Backfill contest_deadline for claims already partially approved before trigger deployment
UPDATE public.hospital_claims 
SET contest_deadline = created_at + INTERVAL '30 days' 
WHERE status = 'partially_approved' 
  AND contest_deadline IS NULL;

-- Re-enable user triggers
ALTER TABLE public.hospital_claims ENABLE TRIGGER USER;
