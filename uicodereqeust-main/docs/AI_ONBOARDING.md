# AI Builder Onboarding Guide — Ronsberger HMO Portal

> **Read this document before touching any code.**
> This is the definitive onboarding brief for Codex, Copilot, Cursor, Antigravity, or any AI coding
> assistant working on this repository.

---

## 1. What This Project Is

**Ronsberger HMO Portal** is a production healthcare authorisation management system for a Nigerian
Health Maintenance Organisation (HMO). It processes hospital authorisation requests, manages
WhatsApp patient communication, issues OTP arrival PINs, runs payroll batches, and handles claims.

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v3 |
| Backend / Auth | Self-hosted Supabase (PostgreSQL + GoTrue + Edge Functions on Deno) |
| Hosting | Hostinger VPS → Coolify → Nginx container |
| Email | Brevo API (`noreply@ronsbergerhmo.io`) |
| WhatsApp | Evolution API on AWS ECS (`https://wa-api.claimspilot.online`) |
| CI | GitHub Actions (`main` only; `.github/workflows/quality.yml`) |

---

## 2. The Single-Branch Rule — Non-Negotiable

**There is exactly ONE branch: `main`.**

- Never create a feature branch, PR branch, hotfix branch, or worktree.
- Commit and push every change directly to `main`.
- If you accidentally created a branch, merge its unique commits to `main` and delete the branch
  before proceeding.

```bash
git branch        # Must show only: * main
git branch -r     # Must show only: origin/main
```

---

## 3. Dead Infrastructure — Never Reintroduce

| Banned | Why |
|---|---|
| Firebase Hosting / Functions | Permanently decommissioned |
| `firebase.json`, `.firebaserc` | Same |
| Managed Supabase project `optistuvyeiojlgmkdks` | Dead; use self-hosted only |
| `medicode.com` emails / domain | Legacy brand; use `ronsbergerhmo.io` |
| `medicode-test` Evolution instance | Cosmetic legacy; still functional — do not rename without coordinating with WhatsApp API |

---

## 4. Live Environment URLs

| Resource | URL |
|---|---|
| Production App | `https://app.ronsbergerhmo.io` |
| Production API | `https://api.ronsbergerhmo.io` |
| GitHub | `https://github.com/Ibeekay1993/medicodeui` (branch: `main`) |

---

## 5. Current Codebase State (as of 2026-11-09)

- **HEAD commit**: see `uicodereqeust-main/public/build-meta.json` (always reflects last deploy)
- **Test suite**: 266 tests in 28 files — all must pass before commit
- **TypeScript**: 0 errors required (`npx tsc --noEmit`)
- **Security**: JWT verified before use; no unverified JWT sub fallback; PII masked in logs

### Key completed hardening
- `_shared/auth.ts` — fail-closed JWT validation
- `_shared/cors.ts` — CORS locked to `https://app.ronsbergerhmo.io`
- `src/lib/sessionState.ts` — patient data cleared on logout
- `src/integrations/supabase/client.ts` — hard-fails if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are absent
- `src/contexts/AuthContext.tsx` — session-inactivity timeout; role-aware
- `src/components/ProtectedRoute.tsx` — MFA gate; loading guard
- `src/pages/Login.tsx` — loading guard prevents login-flash on session resume

---

## 6. Quality Gates (Run Before Every Commit)

```bash
cd uicodereqeust-main

# 1. TypeScript — must be 0 errors
npx tsc --noEmit

# 2. Tests — all must pass
npm test -- --run

# 3. Build — must succeed
npm run build
```

If any gate fails, **do not commit**.

---

## 7. Mobile UI Rules

| Rule | Detail |
|---|---|
| Checkboxes | Exactly `h-4 w-4 rounded-[4px]` — do not stretch |
| Main content bottom padding | `pb-[calc(64px+env(safe-area-inset-bottom))]` on mobile so nav bar never overlaps buttons |
| Dynamic user text | Always `break-words [overflow-wrap:anywhere]` |
| Tab buttons | Use `grid grid-cols-2` on `TabsList` + `whitespace-nowrap` on `TabsTrigger` to keep both tabs equal width |

---

## 8. Security Rules

- **Never commit secrets.** All credentials go into Coolify environment variables only.
- **Never log raw PII.** Use `maskPhone()` and `maskEmail()` from `_shared/utils.ts`.
- **VPS IP** must not appear in any tracked file.
- **Brevo sender** is always hardcoded as `Ronsberger HMO <noreply@ronsbergerhmo.io>` — never read from env.
- **`verify_jwt = false`** Edge Functions must have their own internal token/secret check; audit before adding new ones.

---

## 9. Deployment Process

### Frontend

```bash
# 1. Build
cd uicodereqeust-main
npm run build

# 2. Package
tar -czf /tmp/dist.tar.gz -C dist .

# 3. Copy into Nginx container (prefix: 4s2tyq1...)
docker cp /tmp/dist.tar.gz <nginx-container-id>:/tmp/
docker exec <nginx-container-id> sh -c "rm -rf /usr/share/nginx/html/* && tar -xzf /tmp/dist.tar.gz -C /usr/share/nginx/html/"
```

### Edge Functions

Edge function files are volume-mounted at:
```
/data/coolify/services/rufiptlacf2ik0phgii71ekq/volumes/functions/
```

Copy updated function directories there directly — no container restart needed (Deno hot-reloads).

### Coolify Database Sync (CRITICAL)

Coolify stores its own copy of `docker-compose.yml` in its internal PostgreSQL database. If you
edit `docker-compose.yml` on disk, **you must also sync the Coolify DB** or Coolify will overwrite
your changes on the next redeploy.

```bash
# On VPS, update coolify-db with the current compose file content:
docker exec coolify-db psql -U coolify -c \
  "UPDATE services SET docker_compose_raw = \$\$(cat /path/to/docker-compose.yml)\$\$ WHERE id = 1;"
```

---

## 10. WhatsApp Automation

- Inbound messages arrive via Evolution API webhook → `POST /functions/v1/whatsapp-webhook`
- Worker processes the outbound queue: `POST /functions/v1/whatsapp-worker`
- A host-level cron fires every minute as a backstop: `/root/whatsapp_worker_cron.sh`
- **Worker batch size**: `WHATSAPP_WORKER_BATCH=1` (keeps Deno function within timeout)
- **Outbound delay**: `WHATSAPP_OUTBOUND_DELAY_MS=1500` between messages

---

## 11. How to Avoid Breaking Things

| Risk | Prevention |
|---|---|
| Coolify wiping compose changes | Always sync `docker_compose_raw` in `coolify-db` |
| Login flash (session-detected redirect) | `Login.tsx` now shows spinner while `loading=true` — never remove this guard |
| Tab width distortion on mobile | Keep `grid grid-cols-2` + `whitespace-nowrap` on tab triggers |
| Edge functions losing env vars | Env vars live in Coolify DB compose, not in function code |
| PII in git history | Never commit seed data or migration backfills with real patient records |
| Multiple branches confusing AI tools | Only ever commit to `main`; delete any other branch immediately |

---

## 12. Contacts & Access

- **GitHub**: `Ibeekay1993/medicodeui`
- **Coolify**: accessible on the VPS at port 8000
- **Supabase Studio**: `https://api.ronsbergerhmo.io` (self-hosted)
- **Brevo**: API key in Coolify env vars (`BREVO_API_KEY`)
- **Evolution API**: `https://wa-api.claimspilot.online` (key in env vars)

---

*Last updated: 2026-11-09 | Maintainer: Ronsberger HMO Engineering*
