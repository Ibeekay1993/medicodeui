-- Harden the WhatsApp queue with a durable state machine, stale recovery,
-- processing leases, and provider-message deduplication for outbound replies.
ALTER TABLE public.whatsapp_messages
  ALTER COLUMN status_updated_at SET DEFAULT now();

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS processing_owner text,
  ADD COLUMN IF NOT EXISTS processing_lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_heartbeat_at timestamptz;

UPDATE public.whatsapp_messages
SET status_updated_at = COALESCE(status_updated_at, received_at, created_at, now())
WHERE status_updated_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'whatsapp_messages_status_check'
  ) THEN
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
          'retry'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_processing_lease
  ON public.whatsapp_messages (status, processing_lease_expires_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_queue_fairness
  ON public.whatsapp_messages (status, received_at, next_attempt_at);

ALTER TABLE public.authorization_requests
  ADD COLUMN IF NOT EXISTS whatsapp_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_requests_whatsapp_message_id_unique
  ON public.authorization_requests (whatsapp_message_id)
  WHERE source = 'whatsapp'
    AND NULLIF(btrim(COALESCE(whatsapp_message_id, '')), '') IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_outbound_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL UNIQUE,
  authorization_request_id uuid REFERENCES public.authorization_requests(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'response_pending', 'sent', 'failed', 'retrying')),
  outbound_state text NOT NULL DEFAULT 'not_started'
    CHECK (outbound_state IN ('not_started', 'send_in_progress', 'sent', 'send_failed', 'retry_pending', 'ambiguous')),
  provider_message_id text,
  operation_key text NOT NULL DEFAULT 'authorization_response',
  destination_phone text,
  content_hash text,
  sent_at timestamptz,
  last_error text,
  attempt_count integer NOT NULL DEFAULT 0,
  lease_owner text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_ledger_status
  ON public.whatsapp_outbound_ledger (outbound_state, updated_at);

ALTER TABLE public.whatsapp_outbound_ledger
  ADD COLUMN IF NOT EXISTS outbound_state text;
ALTER TABLE public.whatsapp_outbound_ledger
  ADD COLUMN IF NOT EXISTS attempt_count integer;
ALTER TABLE public.whatsapp_outbound_ledger
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE public.whatsapp_outbound_ledger
  ADD COLUMN IF NOT EXISTS operation_key text;
ALTER TABLE public.whatsapp_outbound_ledger
  ADD COLUMN IF NOT EXISTS destination_phone text;
ALTER TABLE public.whatsapp_outbound_ledger
  ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE public.whatsapp_outbound_ledger
  ADD COLUMN IF NOT EXISTS lease_owner text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'whatsapp_outbound_ledger_state_check'
  ) THEN
    ALTER TABLE public.whatsapp_outbound_ledger
      ADD CONSTRAINT whatsapp_outbound_ledger_state_check
      CHECK (outbound_state IN ('not_started', 'send_in_progress', 'sent', 'send_failed', 'retry_pending', 'ambiguous'));
  END IF;
END $$;

UPDATE public.whatsapp_outbound_ledger
SET outbound_state = COALESCE(outbound_state, CASE status WHEN 'sent' THEN 'sent' WHEN 'failed' THEN 'send_failed' WHEN 'retrying' THEN 'retry_pending' ELSE 'not_started' END),
    attempt_count = COALESCE(attempt_count, 0),
    operation_key = COALESCE(operation_key, 'authorization_response'),
    lease_expires_at = NULL
WHERE outbound_state IS NULL OR attempt_count IS NULL;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_outbound_operation(
  p_message_id text,
  p_authorization_request_id uuid,
  p_operation_key text,
  p_destination_phone text,
  p_content_hash text,
  p_lease_owner text,
  p_lease_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  INSERT INTO public.whatsapp_outbound_ledger (
    message_id,
    authorization_request_id,
    operation_key,
    destination_phone,
    content_hash,
    outbound_state,
    status,
    attempt_count,
    lease_owner,
    lease_expires_at,
    updated_at
  )
  VALUES (
    p_message_id,
    p_authorization_request_id,
    p_operation_key,
    p_destination_phone,
    p_content_hash,
    'send_in_progress',
    'pending',
    1,
    p_lease_owner,
    now() + make_interval(secs => p_lease_seconds),
    now()
  )
  ON CONFLICT (message_id) DO UPDATE
  SET authorization_request_id = EXCLUDED.authorization_request_id,
      operation_key = EXCLUDED.operation_key,
      destination_phone = EXCLUDED.destination_phone,
      content_hash = EXCLUDED.content_hash,
      outbound_state = 'send_in_progress',
      status = 'pending',
      attempt_count = public.whatsapp_outbound_ledger.attempt_count + 1,
      lease_owner = EXCLUDED.lease_owner,
      lease_expires_at = EXCLUDED.lease_expires_at,
      last_error = NULL,
      updated_at = now()
  WHERE public.whatsapp_outbound_ledger.outbound_state IN ('not_started', 'send_failed', 'retry_pending')
    AND (
      public.whatsapp_outbound_ledger.lease_expires_at IS NULL
      OR public.whatsapp_outbound_ledger.lease_expires_at < now()
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_outbound_operation(text, uuid, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_outbound_operation(text, uuid, text, text, text, text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.recover_stale_whatsapp_processing()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.whatsapp_messages wm
  SET status = 'retry',
      status_updated_at = now(),
      next_attempt_at = now(),
      processing_owner = NULL,
      processing_lease_expires_at = NULL,
      processing_heartbeat_at = NULL,
      last_error = COALESCE(wm.last_error, 'reset from stale processing')
  WHERE wm.status = 'processing'
    AND wm.processing_lease_expires_at IS NOT NULL
    AND wm.processing_lease_expires_at < now();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_whatsapp_processing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_whatsapp_processing() TO service_role;
