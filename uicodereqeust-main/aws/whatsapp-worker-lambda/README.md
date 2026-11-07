# Archived: AWS Lambda/SQS WhatsApp worker (paused)

> **Operational status:** This worker is retained for reference and possible future controlled cutover. It is not the active production worker. Do not deploy it, enable its SQS event source mapping, or route Supabase jobs to it without an approved migration and a verified single-consumer/atomic-claim design.

## Current production WhatsApp path

- AWS ECS runs the Evolution API gateway and WhatsApp session. Keep it running.
- The self-hosted Supabase Edge Functions on Hostinger process webhook events and queued notifications.
- The database recovery job calls the self-hosted endpoint at `https://api.ronsbergerhmo.io/functions/v1/whatsapp-worker`.

This archived Lambda package must not be confused with the active AWS ECS Evolution API service. Pausing this worker does not mean AWS ECS or Evolution API should be stopped.

## Why this package is retained

The implementation and infrastructure template are preserved as engineering reference material. They may be useful if a future measured workload justifies moving deterministic queue processing out of Supabase. The code is not proof that the Lambda, SQS queue, Function URL, event source mapping, or production environment variables are currently deployed or enabled.

## Before any future activation

1. Confirm the current Supabase worker and queue state.
2. Design and test atomic message claiming, leases, idempotency and duplicate-delivery handling.
3. Confirm the correct self-hosted Supabase URL and service credentials.
4. Confirm Evolution API connectivity from the Lambda runtime.
5. Deploy with the SQS consumer disabled.
6. Run controlled tests and define rollback.
7. Activate only one queue consumer at a time unless shared atomic claiming is proven.

Never copy service-role keys, worker secrets, Evolution credentials or queue URLs into source control, build artifacts or logs.
