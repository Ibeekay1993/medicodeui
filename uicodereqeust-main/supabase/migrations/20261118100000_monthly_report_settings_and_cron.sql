-- Seed default monthly report settings in global_policies
INSERT INTO public.global_policies (key, value)
VALUES ('monthly_report_settings', '{"email": "ayobolanleafolayan@gmail.com", "enabled": true}'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = '{"email": "ayobolanleafolayan@gmail.com", "enabled": true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.global_policies WHERE key = 'monthly_report_settings'
);

-- Set up pg_cron job to invoke the monthly-report edge function internally via pg_net on the 1st of every month
DO $$
BEGIN
  -- Enable extensions if not already present
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
  
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    -- Unschedule existing job if it is already scheduled to prevent duplicates
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-executive-sla-report') THEN
      PERFORM cron.unschedule('monthly-executive-sla-report');
    END IF;
    
    -- Schedule pg_cron job to hit Deno function at 12:05 AM WAT on the 1st of every month (23:05 UTC on last day of month)
    PERFORM cron.schedule(
      'monthly-executive-sla-report',
      '5 23 28-31 * *',
      $cron_job_sql$ 
      DO $inner$
      BEGIN
        -- Only execute on the actual last day of the month so the report covers the completed month
        IF (CURRENT_DATE + INTERVAL '1 day')::date = date_trunc('month', CURRENT_DATE + INTERVAL '1 month')::date THEN
          PERFORM net.http_post(
            url := 'http://kong:8000/functions/v1/monthly-report',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := '{}'::jsonb
          );
        END IF;
      END $inner$;
      $cron_job_sql$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron/pg_net monthly report scheduling skipped: %', SQLERRM;
END $$;
