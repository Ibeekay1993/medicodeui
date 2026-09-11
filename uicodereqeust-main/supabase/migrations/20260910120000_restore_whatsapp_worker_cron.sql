-- Restore the existing one-minute WhatsApp worker poll.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-worker-poll');
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END
$$;

SELECT cron.schedule(
  'whatsapp-worker-poll',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := current_setting('app.functions_url') || '/whatsapp-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', current_setting('app.worker_secret', true)
    ),
    body := '{"poll":true}'::jsonb
  ) AS request_id;
  $job$
);
