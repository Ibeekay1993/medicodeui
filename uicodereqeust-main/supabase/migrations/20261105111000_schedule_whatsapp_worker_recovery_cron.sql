-- ============================================================
-- Migration: 20261105111000_schedule_whatsapp_worker_recovery_cron.sql
-- Purpose  : Ensure pg_cron recovery poll for whatsapp-worker is
--            scheduled safely without failing if the job didn't exist.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-worker-poll') THEN
      PERFORM cron.unschedule('whatsapp-worker-poll');
    END IF;

    PERFORM cron.schedule(
      'whatsapp-worker-poll',
      '*/5 * * * *',
      $cron_job_sql$
        SELECT net.http_post(
          url := 'https://optistuvyeiojlgmkdks.supabase.co/functions/v1/whatsapp-worker',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-worker-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'medcode_whatsapp_worker_secret_20261004' LIMIT 1)
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 45000
        );
      $cron_job_sql$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron whatsapp-worker-poll schedule skipped: %', SQLERRM;
END;
$$;

COMMIT;
