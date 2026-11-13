-- Align WhatsApp notification delivery with the self-hosted Supabase API.
-- Does not delete notification rows or change authorization/business data.
-- NOTE: pg_cron schedule management is skipped when pg_cron is not installed;
-- on this deployment the host-level cron script handles worker polling instead.

BEGIN;

DO $$
DECLARE
  old_endpoint constant text := 'https://api.ronsbergerhmo.io/functions/v1/whatsapp-worker';
  new_endpoint constant text := 'https://api.ronsbergerhmo.io/functions/v1/whatsapp-worker';
  function_definition text;
  pg_cron_available boolean;
BEGIN
  -- Determine whether pg_cron is available on this instance.
  pg_cron_available := (
    to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL
    AND to_regprocedure('cron.unschedule(text)') IS NOT NULL
    AND to_regclass('cron.job') IS NOT NULL
  );

  -- Ensure pg_net is available (required for trigger function).
  IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RAISE EXCEPTION 'pg_net net.http_post(text,jsonb,jsonb,jsonb,integer) is unavailable';
  END IF;

  -- Update the notification trigger function endpoint if it exists.
  IF to_regprocedure('public.fn_enqueue_whatsapp_notification()') IS NOT NULL THEN
    SELECT pg_get_functiondef('public.fn_enqueue_whatsapp_notification()'::regprocedure)
      INTO function_definition;

    IF position(old_endpoint IN function_definition) > 0 THEN
      function_definition := replace(function_definition, old_endpoint, new_endpoint);
      EXECUTE function_definition;
    END IF;
  END IF;

  -- pg_cron job management: only when pg_cron is installed on this instance.
  -- On deployments using host-level cron (e.g. /root/whatsapp_worker_cron.sh),
  -- this block is intentionally skipped.
  IF pg_cron_available THEN
    -- Correct any existing scheduled worker command.
    UPDATE cron.job
       SET command = replace(command, old_endpoint, new_endpoint)
     WHERE command LIKE '%' || old_endpoint || '%';

    -- Ensure the named recovery job exists exactly once.
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-worker-poll') THEN
      PERFORM cron.unschedule('whatsapp-worker-poll');
    END IF;

    PERFORM cron.schedule(
      'whatsapp-worker-poll',
      '*/5 * * * *',
      format(
        $job$
          SELECT net.http_post(
            url := %L,
            headers := jsonb_build_object(
              'Content-Type', 'application/json'
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 45000
          );
        $job$,
        new_endpoint
      )
    );
  ELSE
    RAISE NOTICE 'pg_cron not available on this instance — skipping cron job registration. Host-level cron is used instead.';
  END IF;
END;
$$;

COMMIT;
