-- Secure daily-preauth-report cron trigger with X-Cron-Secret header
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    -- Unschedule existing job to prevent duplicates
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-preauth-report') THEN
      PERFORM cron.unschedule('daily-preauth-report');
    END IF;
    
    -- Re-schedule pg_cron job with X-Cron-Secret header matching Edge Function fallback
    PERFORM cron.schedule(
      'daily-preauth-report',
      '0 23 * * *',
      $cron_job_sql$ select net.http_post(
           url := 'http://kong:8000/functions/v1/daily-report',
           headers := '{"Content-Type": "application/json", "X-Cron-Secret": "3e8f8a8b-6c7b-4c5b-9d8e-7f6e5d4c3b2a"}'::jsonb,
           body := '{}'::jsonb
         ); $cron_job_sql$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron security hardening update skipped: %', SQLERRM;
END $$;
