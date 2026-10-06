-- Reduce database startup pressure from the WhatsApp queue backstop.
-- A one-minute schedule can repeatedly compete with API traffic on small
-- Supabase compute when the database is already under I/O pressure.
BEGIN;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-worker-poll');
EXCEPTION
  WHEN undefined_object THEN NULL;
END;
$$;

SELECT cron.schedule(
  'whatsapp-worker-poll',
  '*/5 * * * *',
  $job$
    SELECT net.http_post(
      url := 'https://optistuvyeiojlgmkdks.supabase.co/functions/v1/whatsapp-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-worker-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'medcode_whatsapp_worker_secret_20261004'
          LIMIT 1
        )
      ),
      body := '{"poll":true}'::jsonb
    ) AS request_id;
  $job$
);

COMMIT;
