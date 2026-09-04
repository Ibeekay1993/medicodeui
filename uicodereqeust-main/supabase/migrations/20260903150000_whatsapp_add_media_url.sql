-- Add the media_url column referenced by the webhook code so the
-- production schema matches the contract.
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_url TEXT;
