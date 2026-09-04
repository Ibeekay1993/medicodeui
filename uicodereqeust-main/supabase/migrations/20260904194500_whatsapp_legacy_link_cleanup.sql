-- Any legacy WhatsApp message link to a request without hospital ownership
-- cannot be safely authorized. Preserve the raw message, remove only the
-- sensitive authorization_request_id relationship.
UPDATE public.whatsapp_messages wm
SET authorization_request_id = NULL
WHERE wm.authorization_request_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.authorization_requests ar
    WHERE ar.id = wm.authorization_request_id
      AND ar.hospital_id IS NULL
  );

-- Trigger functions are implementation details, not client-callable APIs.
REVOKE ALL ON FUNCTION public.enforce_whatsapp_authorization_security()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_whatsapp_message_request_scope()
FROM PUBLIC, anon, authenticated;
