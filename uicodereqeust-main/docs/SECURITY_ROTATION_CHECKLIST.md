# Production credential rotation and repository security checklist

## Immediate action required

A previous version of `scripts/deploy-vps.py` contained a hardcoded VPS root password. The file has been removed from the current source tree and the deployment workflow no longer uses root SSH. Because the repository was public, treat the exposed credential as compromised.

1. Change the VPS root password in the Hostinger/VPS administration panel immediately.
2. Review SSH authentication logs for unknown source IPs, successful root logins and unexpected users or SSH keys.
3. Disable root SSH login after confirming a separate administrative account works.
4. Disable password-based SSH authentication after verifying key-based access.
5. Review `authorized_keys`, sudoers, systemd services, cron jobs, Docker containers and Coolify deployment credentials for unexpected changes.
6. Rotate any other credentials found in Git history or logs.
7. Store Coolify deployment webhook URLs, Supabase service-role keys, database passwords, Evolution API keys and worker secrets only in their respective secret stores.

## Git history

Removing a secret from the current branch does not remove it from earlier commits, forks, clones, caches or GitHub object history. The repository history must be reviewed and, if the credential is present in reachable history, rewritten using a coordinated history-cleanup procedure. Rotate the credential before any history rewrite. Coordinate with collaborators because rewritten history requires fresh clones or careful resets.

Do not assume that a successful secret scan or a clean current file tree proves historical copies are gone.

## Runtime verification

- Confirm the deployed frontend is built with `VITE_SUPABASE_URL=https://api.ronsbergerhmo.io` and the correct publishable key.
- Confirm no service-role key is embedded in frontend assets.
- Confirm Edge Function secrets exist only in the server-side runtime.
- Confirm the active WhatsApp worker and cron job use the self-hosted Supabase endpoint.
- Confirm AWS ECS Evolution API remains healthy and reachable.
- Confirm AWS Lambda/SQS remains paused unless a separately approved cutover is performed.
