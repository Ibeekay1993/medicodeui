-- Add treatment_submitted_at to authorization_requests
ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS treatment_submitted_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.authorization_requests.treatment_submitted_at IS 'Timestamp when the destination hospital submitted a treatment plan for a referral request';
