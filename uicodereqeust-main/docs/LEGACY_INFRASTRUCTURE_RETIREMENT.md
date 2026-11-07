# Legacy infrastructure retirement record

## Active production path in the repository

- Frontend: `https://app.ronsbergerhmo.io`, deployed through Hostinger/Coolify and fronted by Cloudflare.
- Supabase API, Auth, Storage and Edge Functions: `https://api.ronsbergerhmo.io`.
- WhatsApp: AWS ECS Evolution API → `whatsapp-webhook` and `whatsapp-worker` Edge Functions on self-hosted Supabase.
- AWS Lambda/SQS: retained separately as a paused reference implementation. Do not enable its event source or set `WHATSAPP_LAMBDA_WORKER_URL` in the active Edge Function environment.

## Changes in this cleanup

- Removed Firebase Cloud Function source, package manifest and example environment from active function paths.
- Removed the direct root-SSH deployment script. `deploy:vps` runs checks and relies on the Coolify Git flow; it does not copy files into a live container.
- Replaced the old Meta/Firebase setup guide with a pointer to the current Evolution API guide.
- Moved the historic Meta/Firebase function source to an inert `.txt` archive. The production Meta webhook configuration could not be verified from repository access alone, so its source is preserved pending external confirmation.
- Moved `backfill_missing_chat_codes.mjs` out of the runnable scripts folder. It read a browser session and local chat export, then wrote authorization data through the retired integration. It is retained as inert reference text; do not run it against production.
- Kept the existing AWS Lambda/SQS worker code separate from AWS ECS Evolution API, and documented the Lambda worker as paused.

## References intentionally retained

- Old managed Supabase URLs in historical SQL migrations are migration history and are not active runtime configuration. Do not edit applied migrations; use a new corrective migration.
- The paused Lambda worker contains a blocked old-project identifier as a safety guard. Its presence is not an active connection.
- The archived legacy sources contain old endpoints as provenance. They are not loaded by the application, build, deployment guard, or active Supabase function config.
- `.gitignore` may retain an ignore entry for Firebase build artifacts; this does not add Firebase code or deployment capability.

## External facts that still require operator verification

- Confirm the Meta/Firebase webhook subscription is detached and no production traffic reaches the retired endpoint. This repository cannot inspect provider-side configuration.
- Confirm `WHATSAPP_LAMBDA_WORKER_URL` is absent from the active Edge Function environment and that no Lambda/SQS event source mapping is consuming the production queue.
- Confirm the current Evolution API webhook destination and credentials in AWS ECS/Coolify without exposing secret values.
- Rotate the historically exposed VPS root password and review SSH activity before coordinating any Git history rewrite. See `SECURITY_ROTATION_CHECKLIST.md`.

No production deployment, Cloudflare change, AWS change, database operation or secret rotation was performed as part of this repository cleanup.
