-- Preserve the amount requested by the submitter separately from the amount
-- approved by the utilization manager. Legacy total_amount is approval data
-- for finalized requests, so it is intentionally not used for backfill.
ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS requested_amount NUMERIC(12,2);
