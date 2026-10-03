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
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wdGlzdHV2eWVpb2psZ21rZGtzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDc3NzI3MywiZXhwIjoyMDkwMzUzMjczfQ.X3MVQXZtPurimp3mOV3sgK3DJpqNvO--ga_pdXbCThA"}'::jsonb,
    body := '{"poll":true}'::jsonb
  ) AS request_id;
  $job$
);
