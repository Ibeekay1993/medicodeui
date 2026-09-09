BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-worker-poll');
EXCEPTION
  WHEN undefined_object THEN
    NULL;
  WHEN OTHERS THEN
    RAISE NOTICE 'whatsapp-worker backstop unschedule skipped: %', SQLERRM;
END $$;

COMMIT;
