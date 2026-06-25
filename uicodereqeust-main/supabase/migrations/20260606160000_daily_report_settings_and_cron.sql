-- Seed default daily report settings in global_policies
INSERT INTO public.global_policies (key, value)
VALUES ('daily_report_settings', '{"email": "ayobolanleafolayan@gmail.com", "enabled": true}'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = '{"email": "ayobolanleafolayan@gmail.com", "enabled": true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.global_policies WHERE key = 'daily_report_settings'
);

-- Set up pg_cron job to invoke the daily-report edge function internally via pg_net
DO $$
BEGIN
  -- Enable extensions if not already present
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    -- Unschedule existing job if it is already scheduled to prevent duplicates
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-preauth-report') THEN
      PERFORM cron.unschedule('daily-preauth-report');
    END IF;
    
    -- Schedule pg_cron job to hit Deno function daily at 12:00 AM WAT (23:00 UTC)
    PERFORM cron.schedule(
      'daily-preauth-report',
      '0 23 * * *',
      $cron_job_sql$ select net.http_post(
           url := 'http://kong:8000/functions/v1/daily-report',
           headers := '{"Content-Type": "application/json"}'::jsonb,
           body := '{}'::jsonb
         ); $cron_job_sql$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron/pg_net daily report scheduling skipped: %', SQLERRM;
END $$;
