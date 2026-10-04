-- Properly configured 5-minute backstop for whatsapp-worker using explicit URL and bearer auth.
-- This cleans up any stale retries or pending decision notifications without spamming PostgreSQL errors.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-worker-poll');
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'whatsapp-worker-poll',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://optistuvyeiojlgmkdks.supabase.co/functions/v1/whatsapp-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', current_setting('app.worker_secret', true)),
    body := '{"poll":true}'::jsonb
  ) AS request_id;
  $job$
);
