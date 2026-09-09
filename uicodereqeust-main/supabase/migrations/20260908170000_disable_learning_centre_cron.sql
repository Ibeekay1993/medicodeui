BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  PERFORM cron.unschedule('learning-centre-observation');
EXCEPTION
  WHEN undefined_object THEN
    NULL;
  WHEN OTHERS THEN
    RAISE NOTICE 'Learning Centre cron unschedule skipped: %', SQLERRM;
END $$;

COMMIT;
