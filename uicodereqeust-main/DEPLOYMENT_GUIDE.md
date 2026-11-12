# MedCode Production Deployment Guide

## Production topology

| Component | Production responsibility |
|---|---|
| Cloudflare | DNS, edge TLS, proxy and security controls |
| Hostinger VPS / Coolify | React frontend and self-hosted Supabase services |
| `app.ronsbergerhmo.io` | Frontend |
| `api.ronsbergerhmo.io` | Self-hosted Supabase API and Edge Functions |
| AWS ECS | Evolution API WhatsApp gateway — keep running |
| GitHub | Source of truth and deployment history |

Firebase Hosting and Firebase Cloud Functions are retired. AWS ECS Evolution API remains in service. AWS Lambda/SQS worker deployment is not part of the active production path unless a separately approved cutover is performed.

## Required frontend environment

Configure these in the Coolify frontend application's build-time environment:

- `VITE_SUPABASE_URL=https://api.ronsbergerhmo.io`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<self-hosted Supabase publishable/anon key>`

Never put a service-role key, database password, Evolution API key, webhook token or worker secret in a `VITE_*` variable. Vite embeds `VITE_*` values into the browser bundle.

## Deployment workflow

1. Merge reviewed changes into the production branch.
2. In Coolify, deploy from the intended GitHub repository and production branch.
3. Let Coolify build and replace the frontend container; do not copy files into a running container.
4. Verify `https://app.ronsbergerhmo.io/build-meta.json` and confirm its commit matches the deployed commit.
5. Check the frontend, API health, authentication and a representative hospital workflow.
6. Keep the previous healthy Coolify deployment available for rollback.

The repository's `npm run deploy:vps` command performs local release checks and can invoke a Coolify deployment webhook when `COOLIFY_DEPLOY_WEBHOOK_URL` is configured. The webhook URL is a deployment secret and must be stored in the local environment or CI secret store, never committed.

## Release checks

From `uicodereqeust-main/`:

```bash
npm ci
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

Do not deploy if any check fails. Resolve failures rather than bypassing the guard.

## Self-hosted Supabase

- Keep the project URL configurable through `VITE_SUPABASE_URL`.
- Deploy database migrations in order and inspect the migration history before applying changes.
- Deploy Edge Functions to the self-hosted Supabase stack using the supported Coolify/Supabase deployment procedure.
- Store server-side function secrets in the Edge Functions environment, not in frontend build variables.
- Maintain backups outside the VPS and periodically test restoration.

## WhatsApp

AWS ECS Evolution API remains the WhatsApp gateway. The self-hosted Supabase Edge Functions receive webhook events and call the Evolution API using server-side secrets:

- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE_NAME`
- `EVOLUTION_WEBHOOK_TOKEN`
- `WHATSAPP_WORKER_SECRET`
- `MEDAUTH_INTERNAL_API_KEY` (where required by the worker)

The database recovery job must call:

```
https://api.ronsbergerhmo.io/functions/v1/whatsapp-worker
```

The migration `20261107120000_align_whatsapp_worker_to_self_hosted_supabase.sql` updates existing scheduled commands and the notification trigger function from the retired managed Supabase endpoint to the self-hosted API endpoint. Confirm the migration is applied and verify the active `pg_cron` jobs before relying on automatic recovery.

Do not enable the archived AWS Lambda/SQS worker while the Supabase worker is processing the same queue. Two active consumers require a deliberately designed atomic claim/lease mechanism and a tested cutover plan.

## Security and operations

- Use SSH keys and a dedicated deployment account; do not deploy as root.
- Rotate any credential that has ever appeared in Git history.
- Configure security response headers at Cloudflare or the production web server; HTML meta tags do not set `X-Frame-Options` or `X-Content-Type-Options`. Start CSP in report-only mode, collect the real frontend/API/worker origins, then enforce a reviewed policy. Enable HSTS only after every affected hostname is confirmed HTTPS-only; do not use `preload` until the domain and all subdomains meet the preload requirements.
- Keep repository secrets in Coolify/CI secret storage.
- Restrict VPS firewall ingress to required ports and trusted administration sources.
- Use Cloudflare SSL/TLS in Full (strict) mode with a valid origin certificate.
- Monitor CPU, RAM, disk, PostgreSQL connections, Edge Function errors and WhatsApp queue age.
- Keep encrypted, off-server database backups and test a restore.
- Never delete historical authorization, claims, financial or audit data as part of infrastructure cleanup.

## Rollback

If a release fails, roll back the frontend to the previous healthy Coolify deployment. For database changes, use a reviewed forward-fix or a tested backup restore; do not assume application rollback reverses schema migrations.
