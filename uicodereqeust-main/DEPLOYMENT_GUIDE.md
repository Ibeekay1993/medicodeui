# Ronsberger HMO Portal — Production Deployment & Builder Operations Guide

This document is the **official, authoritative guide** for all developers and builders working on the **Ronsberger HMO Portal**.

---

## 1. Production Architecture Overview

| Component | Production Target | Notes |
|---|---|---|
| **Frontend Portal** | `https://app.ronsbergerhmo.io` | Single Page App (Vite + React + Tailwind + TypeScript) |
| **Backend / Supabase API** | `https://api.ronsbergerhmo.io` | Self-hosted Supabase Stack on VPS |
| **Hosting Server** | **Hostinger VPS** (`2.24.58.189`) | Ubuntu Linux managed via **Coolify** |
| **Frontend Container** | `4s2tyq1...` (Nginx) | Filter: `docker ps --filter "name=4s2tyq1" --format "{{.Names}}"` |
| **Database Container** | `supabase-db-rufiptlacf2ik0phgii71ekq` | PostgreSQL 15 with RLS & Stored Procedures |
| **Edge Functions Container** | `supabase-edge-functions-rufiptlacf2ik0phgii71ekq` | Deno Edge Functions |

> [!CAUTION]
> ### 🛑 STRICT PROHIBITIONS: NO FIREBASE & NO MEDICODE
> - **Firebase and Medicode are 100% decommissioned and cut off.**
> - **NEVER** run `firebase deploy`.
> - **NEVER** reference `medicode` or `medicodeui.web.app`.
> - All hosting and deployments are strictly executed on the **Hostinger VPS via Coolify**.

---

## 2. Standard Builder Deployment Workflow

Before deploying any changes to production, builders must follow this exact four-step workflow:

### Step 1: Sync Git Working Tree
Ensure your code is committed to the `main` branch:
```bash
git status
git checkout main
git pull origin main
```

### Step 2: Run Automated Type Check & Tests
Never deploy code with TypeScript errors or failing test suites:
```bash
cd uicodereqeust-main

# Run TypeScript check (must exit with 0 errors)
npx tsc --noEmit

# Run unit & integration test suite (all 21 suites / 243+ tests must pass)
npm test -- --run
```

### Step 3: Single-Command Production Deployment
Deploy with the automated pre-flight deploy guard:
```bash
npm run deploy:vps
```

### What `npm run deploy:vps` does under the hood:
1. **Pre-flight Validation (`deploy-guard.mjs`)**:
   - Confirms you are on the `main` branch.
   - Detects any uncommitted changes.
   - Runs `npx tsc --noEmit` automatically.
   - Runs `npm run build` which generates `dist/build-meta.json` with the current Git commit hash and timestamp.
   - Validates that the `dist/` bundle was built strictly from the current Git HEAD.
2. **VPS Upload & Container Extraction (`deploy-vps.py`)**:
   - Compresses `dist/` into a temporary archive.
   - Uploads via SFTP directly to the VPS at `2.24.58.189`.
   - Discovers the active Coolify frontend container (`FE_NAME=$(docker ps --filter 'name=4s2tyq1' --format '{{.Names}}')`).
   - Extracts the fresh build into `/usr/share/nginx/html/` inside the running container.
   - Verifies the uploaded assets.

---

## 3. How to Verify Live Production Deployments

To verify that your deployment is live and serving the latest commit:
1. **Check the public build metadata**:
   Open in your browser or run:
   ```bash
   curl -s https://app.ronsbergerhmo.io/build-meta.json
   ```
   Confirm that `gitCommit` matches your latest commit hash:
   ```json
   {
     "buildId": "2026-11-07T13:58:30.501Z_ffaee3e",
     "gitCommit": "ffaee3e",
     "gitBranch": "main",
     "generatedAt": "2026-11-07T13:58:30.502Z"
   }
   ```
2. **Hard-refresh in the browser**:
   Press `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac) to bypass local browser cache.

---

## 4. Supabase Edge Functions Deployment

Edge functions live in `supabase/functions/` and run on the VPS in `supabase-edge-functions-rufiptlacf2ik0phgii71ekq`.

When editing an edge function (e.g., `admin-users`, `whatsapp-worker`, `whatsapp-webhook`):
1. Test your edge function locally or with unit tests.
2. The function files are mounted on the VPS under:
   ```
   /data/coolify/services/rufiptlacf2ik0phgii71ekq/volumes/functions/<function-name>/
   ```
3. After copying changes to the volume, restart the Edge Functions container:
   ```bash
   docker restart supabase-edge-functions-rufiptlacf2ik0phgii71ekq
   ```

---

## 5. Hospital Onboarding & Multi-Tenant Cut-Off Architecture

### How Historical Requests are Protected
To prevent onboarded healthcare providers from viewing past requests or submitting claims for treatments performed prior to their official portal onboarding:
1. Every hospital in `public.hospitals` has an `onboarding_started_at` timestamp column.
2. **Pre-Onboarding State (`onboarding_started_at IS NULL`)**:
   - The hospital portal (`/dashboard/authorizations`, `/dashboard/claims`, `/dashboard`) displays a **100% clean slate (0 requests, 0 claims, 0 value)**.
   - No historical requests are sent over the wire or exposed in the UI.
   - Any claim submission attempt for pre-onboarding requests is strictly blocked.
3. **Portal Live State (`onboarding_started_at` is set)**:
   - When onboarding is officially started for a hospital, `onboarding_started_at` is stamped with the exact date and time.
   - The hospital only sees and can only submit claims for requests created **at or after that timestamp** (`created_at >= onboarding_started_at`).
   - Automated WhatsApp requests incoming from that point forward will appear on their dashboard automatically.
4. **HMO Backoffice & Admin Independence**:
   - HMO administrators, claims auditors, and nurses still see all 14,000+ past requests, audit trails, and reports.

---

## 6. Troubleshooting Common Issues

### Issue A: Chrome `ERR_ECH_FALLBACK_CERTIFICATE_INVALID`
- **Cause**: Chrome's Encrypted Client Hello (ECH) feature may have stale TLS socket cache or a Cloudflare DNS/ECH mismatch across different browser profiles.
- **Fix**:
  1. Open a tab in that profile and navigate to `chrome://net-internals/#sockets`.
  2. Click **"Flush socket pools"**.
  3. Reload `https://app.ronsbergerhmo.io`.
  4. (Optional) In Cloudflare Dashboard > SSL/TLS > Edge Certificates, toggle off "Encrypted Client Hello (ECH)" if client mismatches persist.

### Issue B: Missing Python `paramiko` Module
- **Cause**: Running `deploy-vps.py` requires Python's `paramiko` library for SSH/SFTP.
- **Fix**: Run `pip install paramiko` once on your machine.

---
*Maintained by the Ronsberger HMO Engineering Team.*
