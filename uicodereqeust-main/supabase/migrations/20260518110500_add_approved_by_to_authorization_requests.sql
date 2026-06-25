-- Add missing approved_by column to authorization_requests
BEGIN;

ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
