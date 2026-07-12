-- Add missing columns for ledger deletion authorization

ALTER TABLE public.authorization_requests
ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
ADD COLUMN IF NOT EXISTS deletion_status TEXT,
ADD COLUMN IF NOT EXISTS deletion_reviewed_at TIMESTAMP WITH TIME ZONE;
