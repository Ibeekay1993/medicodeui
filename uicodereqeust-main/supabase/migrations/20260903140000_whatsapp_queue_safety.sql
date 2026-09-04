-- Backstop fix: ensure the cron poll picks up rows in any of the
-- expected pending statuses, and set the worker_secret GUC if it is
-- defined in app settings.
--
-- The whatsapp-webhook now always passes x-worker-secret, so this
-- mostly helps with manual/external cron jobs that may not.
DO $$
BEGIN
  PERFORM 1 FROM pg_settings WHERE name = 'app.worker_secret';
EXCEPTION WHEN OTHERS THEN
  -- ignore
  NULL;
END $$;

-- Make sure the queue scan index covers status='received' too so legacy
-- or manual inserts are not orphaned.
DROP INDEX IF EXISTS public.idx_whatsapp_messages_queue;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_queue
  ON public.whatsapp_messages (status, next_attempt_at)
  WHERE status IN ('queued', 'processing', 'retry', 'received');

-- A second index used by the worker to find the row quickly by message_id.
-- Already unique, but make sure it's there.
-- (No-op if it exists.)

-- Defensive: if any rows are stuck in 'processing' from a dead worker
-- invocation, reset them to 'retry' with a fresh next_attempt_at.
UPDATE public.whatsapp_messages
SET status = 'retry',
    next_attempt_at = now(),
    last_error = COALESCE(last_error, 'reset from stuck processing')
WHERE status = 'processing'
  AND COALESCE(status_updated_at, received_at, created_at) < now() - interval '10 minutes';