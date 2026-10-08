-- These rows reached the configured retry limit with a permanent provider
-- rejection: Evolution reported that the WhatsApp destination does not exist.
-- Mark them terminal and replace stored provider bodies, which can include
-- recipient identifiers, with a safe operational reason.
BEGIN;

UPDATE public.whatsapp_notifications
SET status = 'failed_v2',
    last_error = 'WhatsApp provider could not find this recipient number (HTTP 400). Verify the number before retrying.',
    processing_lease_owner = NULL,
    processing_lease_expires_at = NULL
WHERE status = 'retry_v2'
  AND COALESCE(attempts, 0) >= 5
  AND last_error LIKE 'Evolution send 400:%';

COMMIT;
