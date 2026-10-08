-- A transient worker regression recorded successful Evolution sends as
-- "body is not defined". Evolution may already have accepted these requests,
-- so stop automatic retries and preserve the uncertainty for reconciliation.
BEGIN;

UPDATE public.whatsapp_messages AS wm
SET status = 'response_pending',
    status_updated_at = now(),
    next_attempt_at = now(),
    processing_owner = NULL,
    processing_lease_expires_at = NULL,
    processing_heartbeat_at = NULL,
    last_error = 'Provider accepted the acknowledgment; confirm receipt before retrying.'
FROM public.whatsapp_outbound_ledger AS l
WHERE l.message_id = wm.message_id
  AND l.operation_key = 'authorization_response'
  AND l.last_error = 'body is not defined'
  AND wm.status = 'retry';

UPDATE public.whatsapp_outbound_ledger
SET status = 'retrying',
    outbound_state = 'ambiguous',
    provider_message_id = NULL,
    last_error = 'Provider may have accepted the message; confirm receipt before retrying.',
    lease_owner = NULL,
    lease_expires_at = NULL,
    updated_at = now()
WHERE status = 'failed'
  AND outbound_state = 'send_failed'
  AND last_error = 'body is not defined';

UPDATE public.whatsapp_notifications
SET status = 'ambiguous_v2',
    last_error = 'Provider may have accepted the message; confirm receipt before retrying.',
    processing_lease_owner = NULL,
    processing_lease_expires_at = NULL
WHERE status IN ('retry_v2', 'failed_v2')
  AND last_error = 'body is not defined';

COMMIT;
