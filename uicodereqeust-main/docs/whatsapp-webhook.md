# WhatsApp integration — production operations

## Active architecture

- **AWS ECS:** Evolution API gateway and WhatsApp session. Keep this service running.
- **Hostinger VPS / self-hosted Supabase:** webhook and worker Edge Functions, notification queue and application database.
- **Cloudflare:** public DNS and HTTPS routing.

The active webhook endpoint is:

```
https://api.ronsbergerhmo.io/functions/v1/whatsapp-webhook
```

Configure the Evolution API instance to send the message events required by the deployed `whatsapp-webhook` Edge Function to that endpoint. Use the webhook-token header expected by the function and keep the token private. Confirm the exact event names and payload format against the deployed function version before changing the Evolution instance configuration.

## Required server-side secrets

Set these in the self-hosted Supabase Edge Functions environment. Never expose them as Vite/browser variables.

- `EVOLUTION_API_URL` — HTTPS base URL for the AWS ECS Evolution API service.
- `EVOLUTION_API_KEY` — Evolution API credential.
- `EVOLUTION_INSTANCE_NAME` — active Evolution instance name.
- `EVOLUTION_WEBHOOK_TOKEN` — shared secret for inbound webhook authentication.
- `WHATSAPP_WORKER_SECRET` — internal worker authentication.
- `MEDAUTH_INTERNAL_API_KEY` — only where the worker's internal authorization endpoint requires it.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — supplied to the Edge Functions runtime for the self-hosted project.
- AI provider credentials such as `GEMINI_API_KEY` only if the deployed worker implementation uses them.

Do not commit secret values. Store them in Coolify/Supabase Edge Functions secret configuration.

Approved-patient Arrival PIN messages follow the same outbound path: `send-approval-email` invokes `send-whatsapp-otp`, which authenticates its internal call to `send-whatsapp` with the service-role key; `send-whatsapp` sends through the configured Evolution instance. Staff-started sends remain paused when `WHATSAPP_OUTBOUND_PAUSED=true`, while the trusted server-side approval notice is allowed. The service-role key and Evolution API key must remain server-side.

## Worker recovery

The database notification trigger enqueues decision notifications. The `whatsapp-worker-poll` cron job provides recovery for queued work that was not processed immediately.

Migration `20261107120000_align_whatsapp_worker_to_self_hosted_supabase.sql` is prepared but has **not** been applied. Do not apply it to production until the self-hosted database owner verifies the live extension versions, trigger definition, cron ownership and secrets. The migration intentionally fails before changing anything if its required Vault, `pg_net`, `pg_cron` functions, timeout or secret are missing.

Run this read-only preflight as the same `postgres` database role that will apply the migration. It returns secret readiness as a boolean and never prints a secret value:

```sql
SELECT
  current_database() AS database_name,
  current_user AS migration_role,
  (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
  to_regclass('vault.decrypted_secrets') IS NOT NULL AS vault_available,
  to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NOT NULL AS pg_net_http_post_available,
  to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL AS pg_cron_named_schedule_available,
  to_regprocedure('cron.unschedule(text)') IS NOT NULL AS pg_cron_named_unschedule_available,
  to_regclass('cron.job') IS NOT NULL AS cron_jobs_available,
  current_setting('pg_net.max_timeout_ms', true) AS pg_net_max_timeout_ms;

-- Run only after the first query confirms the pg_cron objects exist.
SELECT
  has_table_privilege(current_user, 'cron.job', 'UPDATE') AS can_update_cron_jobs,
  has_function_privilege(current_user, 'cron.schedule(text,text,text)', 'EXECUTE') AS can_schedule_named_job,
  has_function_privilege(current_user, 'cron.unschedule(text)', 'EXECUTE') AS can_unschedule_named_job;

-- Run only after the first query confirms the Vault view exists.
SELECT EXISTS (
  SELECT 1
  FROM vault.decrypted_secrets
  WHERE name = 'medcode_whatsapp_worker_secret_20261004'
    AND NULLIF(BTRIM(decrypted_secret), '') IS NOT NULL
) AS worker_secret_ready;

-- Run only after the first query confirms cron.job exists.
SELECT
  jobid,
  jobname,
  schedule,
  active,
  username,
  position('optistuvyeiojlgmkdks.supabase.co' in command) > 0 AS targets_retired_project
FROM cron.job
WHERE jobname = 'whatsapp-worker-poll'
   OR command LIKE '%/functions/v1/whatsapp-worker%'
ORDER BY jobname, jobid;
```

If any object reported by the first query is missing, stop and do not run the remaining queries. Otherwise run the Vault-secret query; if the Vault view is missing or the boolean is false, stop. Then run the cron-job query. Proceed only when Vault, `net.http_post`, both named cron functions and `cron.job` are present, the role is the database superuser, it has the listed job privileges, `pg_net.max_timeout_ms` is at least `45000`, the secret-ready check is true, and all relevant job owners/endpoints are understood. If the migration role differs from the job owner, `pg_cron` row-level security can hide other jobs; do not conclude there are none from a restricted-role result.

Before applying, verify in the secret manager—without copying values to SQL output, logs or chat—that the Vault secret and Edge Function `WHATSAPP_WORKER_SECRET` are the same current secret. Also verify `WHATSAPP_LAMBDA_WORKER_URL` is unset in the active Edge Function environment: the current worker proxies to Lambda when that variable is set. AWS ECS Evolution API remains active; this check concerns only the paused Lambda/SQS worker.

`pg_net` queues HTTP requests asynchronously. The cron command reads the decrypted worker secret from Vault into the request headers, so the queued request can retain that header until processed and cleaned up. Confirm only the restricted database roles can read `net.http_request_queue` and its related response data before enabling this recovery job; never inspect or export the header values.

Apply the migration to staging first. Review the resulting trigger and cron metadata, then test a single controlled WhatsApp request and a single decision notification through AWS ECS Evolution API. Confirm delivery, audit logging, retry behavior and that there is only one queue consumer. Schedule production application only through the separately approved database change process.

After an approved application, verify:

1. The notification trigger points to `https://api.ronsbergerhmo.io/functions/v1/whatsapp-worker`.
2. The `whatsapp-worker-poll` job exists and targets the same endpoint.
3. Other active cron commands do not reference the retired managed Supabase project.
4. A test notification reaches AWS ECS Evolution API and is delivered.
5. A failed send remains retryable and is not duplicated.

Do not activate the archived AWS Lambda/SQS worker while the Supabase worker is consuming the same notification queue. A dual-worker deployment requires an explicit atomic-claim/lease design and a controlled cutover.

## Safe operational checks

- Test inbound webhook authentication with an invalid token and confirm it is rejected.
- Send a controlled test message through the active instance.
- Verify message status updates and notification audit records.
- Inspect Edge Function logs and queue age after each deployment.
- Keep the AWS ECS service, instance credentials and webhook token out of public logs and Git.
