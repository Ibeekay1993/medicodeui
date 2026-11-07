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

## Worker recovery

The database notification trigger enqueues decision notifications. The `whatsapp-worker-poll` cron job provides recovery for queued work that was not processed immediately.

Apply migration `20261107120000_align_whatsapp_worker_to_self_hosted_supabase.sql`, then verify:

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
