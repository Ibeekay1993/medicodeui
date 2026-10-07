-- Keep old WhatsApp deliveries from becoming new clinical requests when
-- provider retries or delayed queue work finally reaches the worker.
-- `stale` is an operational hold only; it never expires an authorization.

ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_status_check;

ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_status_check
  CHECK (
    status IN (
      'received',
      'queued',
      'claimed',
      'processing',
      'authorization_created',
      'response_pending',
      'response_sent',
      'completed',
      'failed',
      'retry',
      'stale'
    )
  );

COMMENT ON CONSTRAINT whatsapp_messages_status_check
  ON public.whatsapp_messages IS
  'stale means the inbound message was held from automatic processing; it is not a clinical authorization expiry.';

CREATE OR REPLACE FUNCTION public.recover_stale_whatsapp_processing()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  WITH stale_rows AS MATERIALIZED (
    SELECT wm.id
    FROM public.whatsapp_messages wm
    WHERE wm.status = 'processing'
      AND COALESCE(wm.status_updated_at, wm.received_at, wm.created_at) < now() - interval '10 minutes'
      AND (wm.processing_heartbeat_at IS NULL OR wm.processing_heartbeat_at < now() - interval '10 minutes')
      AND (
        (wm.processing_lease_expires_at IS NOT NULL AND wm.processing_lease_expires_at < now())
        OR wm.processing_lease_expires_at IS NULL
      )
    ORDER BY COALESCE(wm.status_updated_at, wm.received_at, wm.created_at)
    LIMIT 200
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.whatsapp_messages wm
  SET status = 'retry',
      status_updated_at = now(),
      next_attempt_at = now(),
      processing_owner = NULL,
      processing_lease_expires_at = NULL,
      processing_heartbeat_at = NULL,
      last_error = COALESCE(wm.last_error, 'reset from stale processing')
  FROM stale_rows sr
  WHERE wm.id = sr.id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_whatsapp_processing()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_whatsapp_processing()
  TO service_role;
