-- Recover decision notifications after a Lambda/Edge worker is interrupted
-- between claiming the row and persisting its next state. Expired claims below
-- the attempt limit can be reclaimed; claims that exhausted the limit become
-- terminal instead of remaining in processing_v2 indefinitely.
BEGIN;

UPDATE public.whatsapp_notifications
SET status = 'failed_v2',
    last_error = 'Worker attempt limit reached after an expired processing lease.',
    processing_lease_owner = NULL,
    processing_lease_expires_at = NULL
WHERE status = 'processing_v2'
  AND COALESCE(attempts, 0) >= 5
  AND (processing_lease_expires_at IS NULL OR processing_lease_expires_at < now());

CREATE OR REPLACE FUNCTION public.claim_whatsapp_decision_notification(
  p_notification_id uuid,
  p_lease_owner text,
  p_lease_seconds integer DEFAULT 180
)
RETURNS SETOF public.whatsapp_notifications
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.whatsapp_notifications AS n
  SET status = 'processing_v2',
      attempts = COALESCE(n.attempts, 0) + 1,
      processing_lease_owner = p_lease_owner,
      processing_lease_expires_at = now() + make_interval(secs => GREATEST(30, LEAST(p_lease_seconds, 600)))
  WHERE n.id = p_notification_id
    AND COALESCE(n.attempts, 0) < 5
    AND (
      n.status IN ('queued_v2', 'retry_v2')
      OR (
        n.status = 'processing_v2'
        AND (n.processing_lease_expires_at IS NULL OR n.processing_lease_expires_at < now())
      )
    )
  RETURNING n.*;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_decision_notification(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_decision_notification(uuid, text, integer)
  TO service_role;

COMMIT;
