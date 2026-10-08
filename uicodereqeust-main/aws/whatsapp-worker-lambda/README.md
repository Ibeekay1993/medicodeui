# WhatsApp worker on Lambda and SQS

This package keeps Supabase as the application database and record of authorization and message-delivery state. Supabase webhooks and decision triggers submit small job identifiers to the authenticated Lambda Function URL. Lambda places those identifiers on SQS; an SQS event source invokes this same Lambda to run the existing WhatsApp worker and call Evolution directly.

This moves worker CPU, AI calls, and Evolution HTTP calls out of Supabase Edge Functions and removes inline worker execution from the webhook/decision wake-up request. Supabase still performs required reads/writes, keeps the durable application outbox, and runs its existing five-minute recovery poll. That poll remains until SQS delivery, DLQ monitoring, and retries have been observed in production; therefore this cutover reduces Edge Function work but does not make Supabase a storage-only service or eliminate database query load.

## Build

Run from the repository root:

```powershell
node aws/whatsapp-worker-lambda/build.mjs
Compress-Archive -LiteralPath aws/whatsapp-worker-lambda/dist/index.js -DestinationPath aws/whatsapp-worker-lambda/dist/whatsapp-worker-lambda.zip -Force
```

Configure the existing Lambda as Node.js 22.x, handler `index.handler`, x86_64, 512 MB, and 120 seconds. The SQS queue visibility timeout in the template is 720 seconds (six times the function timeout). Keep the SQS batch size at one and its maximum event-source concurrency at two. This bounds concurrent database jobs without setting Lambda reserved concurrency.

## Create the queue infrastructure

Deploy `aws/whatsapp-worker-lambda/infrastructure.yml` in `eu-west-1` with the existing Lambda execution role name. It creates:

- an encrypted SQS work queue and a 14-day dead-letter queue;
- a narrowly scoped role policy for send/receive/delete/visibility on the work queue;
- a batch-size-one Lambda event source mapping, disabled by default.

The queue producer only accepts one validated message ID, authorization request UUID, or the existing recovery-poll marker. It does not accept clinical text or secrets. Standard SQS delivery is at-least-once; the worker's database processing leases and outbound ledger remain the idempotency controls.

Set the CloudFormation `QueueUrl` output as `WHATSAPP_WORKER_QUEUE_URL` on the Lambda. Keep the event source mapping disabled while checking the production gate and queue configuration. Configure these production settings before routing traffic:

- `WHATSAPP_LAMBDA_PILOT_MODE=production-cutover`
- `WHATSAPP_LAMBDA_PROCESSING_ENABLED=true`
- `WHATSAPP_LAMBDA_PRODUCTION_CUTOVER_ACK=PRODUCTION_WHATSAPP_WORKER_CUTOVER_20261008`
- `WHATSAPP_LAMBDA_PRODUCTION_PROJECT_REF=optistuvyeiojlgmkdks`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `WHATSAPP_WORKER_SECRET`
- `EVOLUTION_API_URL` (an HTTPS URL, e.g. `https://wa-api.claimspilot.online`) and `EVOLUTION_API_KEY`
- `WHATSAPP_WORKER_QUEUE_URL`

Transfer any optional worker configuration currently used by the Supabase Edge Function, including `EVOLUTION_INSTANCE_NAME`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL`, `MODAL_ENDPOINT`, `MODAL_WEBHOOK_SECRET`, `MEDAUTH_INTERNAL_BASE_URL`, `MEDAUTH_INTERNAL_PATH`, `MEDAUTH_INTERNAL_API_KEY`, `WHATSAPP_MAX_ATTEMPTS`, `WHATSAPP_WORKER_BATCH`, `WHATSAPP_MAX_AUTO_PROCESS_AGE_MINUTES`, `WHATSAPP_OUTBOUND_DELAY_MS`, `WHATSAPP_PROCESSING_LEASE_MS`, `GEMINI_TIMEOUT_MS`, `GROQ_TIMEOUT_MS`, and `MODAL_TIMEOUT_MS` as applicable. Keep all secret values out of source control, build artifacts, command output, and logs.

## Cutover and rollback

1. Deploy the Lambda code and create the queue stack with the consumer disabled.
2. Set and verify the Lambda environment and production gate. Its authenticated health response must report `state: ready` and `queueConfigured: true`.
3. Enable the event source mapping, then send one controlled test job from a hospital test conversation and confirm it is removed from the queue and recorded as completed/sent in Supabase. Monitor queue depth, DLQ depth, Lambda errors/throttles, Supabase API/Postgres errors, and actual WhatsApp delivery.
4. Only after the consumer is verified, create/use the Lambda Function URL with its shared worker header and set `WHATSAPP_LAMBDA_WORKER_URL` on Supabase's `whatsapp-worker` function. The URL is public at the network layer, so use a newly rotated high-entropy worker secret before enabling it.
5. Keep the five-minute Supabase recovery poll while observing production. If enqueueing or Lambda processing fails, remove `WHATSAPP_LAMBDA_WORKER_URL` from the Supabase function configuration to restore its prior in-Supabase execution path. Do not delete or purge queued messages during rollback.

Failed targeted jobs return to SQS after their application retry delay. Repeated infrastructure failures go to the dead-letter queue after 20 receives for inspection; they are not automatically replayed from the DLQ. Decision delivery remains protected by the existing outbound ledger so uncertain provider acceptance is not automatically duplicated.

## What this does not change

Supabase remains the source of truth and still carries required reads, writes, trigger/outbox creation, and the five-minute reconciliation poll. The dashboard's prior Supabase unhealthy snapshot showed substantial Auth/API errors, while the supplied logs did not attribute the query timeouts to this worker. Measure before/after Supabase metrics after the live cutover before claiming database load or health improved. Lambda and Evolution are in different AWS regions (eu-west-1 and eu-north-1); the current Evolution HTTPS hostname resolves publicly, so requests use public TLS and are not a private VPC route.
