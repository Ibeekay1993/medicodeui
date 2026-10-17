# WhatsApp worker on Lambda and SQS

This package keeps Supabase as the application database and record of authorization and message-delivery state. Supabase webhooks and decision triggers invoke the existing Supabase worker. When `WHATSAPP_LAMBDA_WORKER_URL` is configured, that worker forwards validated job identifiers to the Lambda Function URL. Lambda places those identifiers on SQS; an SQS event source invokes this Lambda, which calls the shared worker in deterministic-only mode and calls Evolution directly.

This moves deterministic worker CPU and Evolution HTTP calls out of Supabase Edge Functions and removes inline worker execution from the webhook/decision wake-up request. Lambda does not call Gemini, Groq, or Modal; the direct Supabase worker path remains AI-capable. Deterministic-only submissions retain the original treatment text, skip automatic tariff-item matching, and carry a manual tariff-confirmation note for the review team. Supabase still performs required reads/writes, keeps the durable application outbox, and runs its existing five-minute recovery poll. That poll remains until SQS delivery, DLQ monitoring, and retries have been observed in production; therefore this cutover reduces Edge Function work but does not make Supabase a storage-only service or eliminate database query load.

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
- No AI provider is required for Lambda processing. Do not transfer Gemini, Groq, or Modal credentials to Lambda for this migration; the Supabase worker retains its existing AI-capable mode when it runs directly.

Transfer only optional non-AI worker configuration as needed, including `EVOLUTION_INSTANCE_NAME`, `MEDAUTH_INTERNAL_BASE_URL`, `MEDAUTH_INTERNAL_PATH`, `MEDAUTH_INTERNAL_API_KEY`, `WHATSAPP_MAX_ATTEMPTS`, `WHATSAPP_WORKER_BATCH`, `WHATSAPP_MAX_AUTO_PROCESS_AGE_MINUTES`, `WHATSAPP_OUTBOUND_DELAY_MS`, and `WHATSAPP_PROCESSING_LEASE_MS`. Keep all secret values out of source control, build artifacts, command output, and logs.

## Cutover and rollback

1. Deploy the Lambda code and create the queue stack with the consumer disabled and the processing gate false.
2. Configure the required non-AI Lambda environment. The authenticated health response must report `state: ready` and `queueConfigured: true`; this health check does not verify parser coverage, Evolution connectivity, or Supabase connectivity.
3. Create the Lambda Function URL with the application-level `x-worker-secret` check. The URL is public at the network layer; do not route production traffic to it until its shared secret is secured and verified.
4. With no Supabase traffic routed yet, enable the processing gate and verify readiness, then enable the SQS event source mapping. At this point the queue should be empty; no live jobs are processed until the Supabase route is changed.
5. Set `WHATSAPP_LAMBDA_WORKER_URL` on Supabase's `whatsapp-worker` function during a quiet, monitored window. This switches **all** worker wake-ups (all hospitals, decision notices, and the scheduled poll) to Lambda; the current router has no single-hospital canary setting. Send one fresh hospital request and verify its acknowledgement and single authorization, then test one approval/decision and verify exactly one delivery. Check the queue, DLQ, Lambda errors/throttles, Supabase metrics, and the actual WhatsApp recipients before continuing.
6. Keep the five-minute Supabase recovery poll while observing production. For rollback, disable the SQS event source mapping first, wait for in-flight Lambda work to finish, then remove `WHATSAPP_LAMBDA_WORKER_URL` to return new jobs to the existing Supabase worker. Do not purge queued messages. Do not use the processing gate as the only pause while the mapping is enabled: rejected receives still count toward the five-receive DLQ threshold.

Failed targeted jobs return to SQS after their application retry delay. Repeated infrastructure failures go to the dead-letter queue after five receives for inspection; they are not automatically replayed from the DLQ. Decision delivery remains protected by the existing outbound ledger so uncertain provider acceptance is not automatically duplicated.

## What this does not change

Supabase remains the source of truth and still carries required reads, writes, trigger/outbox creation, and the five-minute reconciliation poll. The dashboard's prior Supabase unhealthy snapshot showed substantial Auth/API errors, while the supplied logs did not attribute the query timeouts to this worker. Measure before/after Supabase metrics after the live cutover before claiming database load or health improved. Lambda and Evolution are in different AWS regions (eu-west-1 and eu-north-1); the current Evolution HTTPS hostname resolves publicly, so requests use public TLS and are not a private VPC route.
