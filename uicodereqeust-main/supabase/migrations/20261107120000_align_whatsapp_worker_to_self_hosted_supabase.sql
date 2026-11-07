-- Align WhatsApp notification delivery with the self-hosted Supabase API.
-- Apply only after the preflight in docs/whatsapp-webhook.md passes.
-- Does not delete notification rows or change authorization/business data.

BEGIN;

DO $$
DECLARE
  old_endpoint constant text := 'https://optistuvyeiojlgmkdks.supabase.co/functions/v1/whatsapp-worker';
  new_endpoint constant text := 'https://api.ronsbergerhmo.io/functions/v1/whatsapp-worker';
  worker_secret_name constant text := 'medcode_whatsapp_worker_secret_20261004';
  function_definition text;
BEGIN
  -- Fail before changing the trigger or jobs if the runtime requirements are
  -- absent. In particular, an empty Vault value would make cron calls receive
  -- 403 responses while giving the appearance of a scheduled recovery job.
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION 'Supabase Vault view vault.decrypted_secrets is unavailable';
  END IF;

  IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL THEN
    RAISE EXCEPTION 'pg_net net.http_post(text,jsonb,jsonb,jsonb,integer) is unavailable';
  END IF;

  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL
     OR to_regprocedure('cron.unschedule(text)') IS NULL
     OR to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION 'pg_cron named-job functions and cron.job are required for WhatsApp recovery';
  END IF;

  IF NOT has_table_privilege(current_user, 'cron.job', 'UPDATE')
     OR NOT has_function_privilege(current_user, 'cron.schedule(text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege(current_user, 'cron.unschedule(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Apply this migration as a database role allowed to update and schedule pg_cron jobs';
  END IF;

  IF NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'Apply this migration as the PostgreSQL superuser so pg_cron row security cannot hide jobs owned by another role';
  END IF;

  IF current_setting('pg_net.max_timeout_ms', true) IS NULL
     OR current_setting('pg_net.max_timeout_ms')::integer < 45000 THEN
    RAISE EXCEPTION 'pg_net.max_timeout_ms must be at least 45000 for the configured worker request';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM vault.decrypted_secrets
     WHERE name = worker_secret_name
       AND NULLIF(BTRIM(decrypted_secret), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The non-empty worker secret % must exist in Vault before applying this migration', worker_secret_name;
  END IF;

  IF to_regprocedure('public.fn_enqueue_whatsapp_notification()') IS NULL THEN
    RAISE EXCEPTION 'Expected notification trigger function public.fn_enqueue_whatsapp_notification() was not found';
  END IF;

  SELECT pg_get_functiondef('public.fn_enqueue_whatsapp_notification()'::regprocedure)
    INTO function_definition;

  IF position(old_endpoint IN function_definition) > 0 THEN
    function_definition := replace(function_definition, old_endpoint, new_endpoint);
    EXECUTE function_definition;
  ELSIF position(new_endpoint IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Notification trigger function does not contain the expected legacy endpoint; inspect it before applying this migration';
  END IF;

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
               WHERE name = %L
               LIMIT 1
            )
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 45000
        );
      $job$,
      new_endpoint,
      worker_secret_name
    )
  );
END;
$$;

COMMIT;
