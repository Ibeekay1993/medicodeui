-- Align WhatsApp notification delivery with the self-hosted Supabase API.
-- Safe to apply after the earlier managed-Supabase migrations have run.
-- Does not delete notification rows or change authorization/business data.

BEGIN;

DO $$
DECLARE
  old_endpoint constant text := 'https://optistuvyeiojlgmkdks.supabase.co/functions/v1/whatsapp-worker';
  new_endpoint constant text := 'https://api.ronsbergerhmo.io/functions/v1/whatsapp-worker';
  function_definition text;
BEGIN
  IF to_regprocedure('public.fn_enqueue_whatsapp_notification()') IS NULL THEN
    RAISE EXCEPTION 'Expected notification trigger function public.fn_enqueue_whatsapp_notification() was not found';
  END IF;

  SELECT pg_get_functiondef('public.fn_enqueue_whatsapp_notification()'::regprocedure)
    INTO function_definition;

  IF position(old_endpoint IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Notification trigger function does not contain the expected legacy endpoint; inspect it before applying this migration';
  END IF;

  function_definition := replace(function_definition, old_endpoint, new_endpoint);
  EXECUTE function_definition;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    -- Correct any existing scheduled worker command that still targets the retired project.
    UPDATE cron.job
       SET command = replace(command, old_endpoint, new_endpoint)
     WHERE command LIKE '%' || old_endpoint || '%';

    -- Ensure the named recovery job exists exactly once and targets the self-hosted API.
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
              'Content-Type', 'application/json',
              'x-worker-secret', (
                SELECT decrypted_secret
                  FROM vault.decrypted_secrets
                 WHERE name = 'medcode_whatsapp_worker_secret_20261004'
                 LIMIT 1
              )
            ),
            body := '{}'::jsonb,
            timeout_milliseconds := 45000
          );
        $job$,
        new_endpoint
      )
    );
  ELSE
    RAISE NOTICE 'pg_cron is not installed; scheduled WhatsApp recovery was not changed';
  END IF;
END;
$$;

COMMIT;
