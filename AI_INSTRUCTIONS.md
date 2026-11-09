# AI BUILDER MASTER SPECIFICATION & INSTRUCTION MANUAL
**RONSBERGER HMO ENTERPRISE PORTAL**

> **ATTENTION ALL AI CODING AGENTS (Codex, Claude Code, Cursor, Antigravity, Copilot, etc.):**  
> Read this document completely BEFORE reading any other file, making assumptions, or proposing architectural changes.  
> This file is the single, authoritative source of truth for the codebase, infrastructure, deployment workflows, and Git management policies.

---

## 1. PRODUCT IDENTITY & DOMAINS

- **Platform Name**: **Ronsberger HMO Portal**.
- **Company**: Ronsberger Nigeria Limited (Licensed HMO).
- **Production Web Application**: **`https://app.ronsbergerhmo.io`**
- **Production API & Supabase Backend**: **`https://api.ronsbergerhmo.io`**
- **Canonical Email Domain**: `@ronsbergerhmo.io` (fallback placeholder: `no-email@ronsbergerhmo.io`).

---

## 2. GIT SINGLE-BRANCH POLICY (`main` ONLY)

- **THERE IS ONLY ONE BRANCH**: **`main`**.
- **No Branches Are Allowed**: Never create local or remote branches, temporary branches, pull-request branches, or branch-based worktrees. Do all work directly on `main`.
- **Direct Main Workflow**: Validate changes, commit them directly to `main`, and push `main`. If an unexpected branch exists, preserve any unique work on `main` first, then delete that branch.
- **Single Source of Truth on GitHub**: The GitHub repository must only have `main` as its active branch. All production code must be deployable from `main`.

---

## 3. STRICTLY PROHIBITED LEGACY INFRASTRUCTURE (PERMANENTLY DECOMMISSIONED)

The system underwent a complete migration away from Firebase and managed cloud services. Any AI proposing or referencing the following is **STRICTLY PROHIBITED**:

| Legacy Component | Status | Action Required |
| :--- | :--- | :--- |
| **Firebase Hosting** | **PERMANENTLY DEAD** | NEVER run `firebase deploy`. NEVER generate `firebase.json` or `.firebaserc`. |
| **`medicodeui.web.app`** | **DECOMMISSIONED** | Never redirect users or API calls here. |
| **Firebase Cloud Functions** | **RETIRED** | All backend functions are Supabase Edge Functions (`uicodereqeust-main/supabase/functions/`). |
| **Managed Supabase `optistuvyeiojlgmkdks`** | **DECOMMISSIONED** | Old managed Supabase cloud project is dead. Never fall back to this URL. Frontend must fail loudly if `VITE_SUPABASE_URL` is omitted. |
| **Meta WhatsApp Cloud API / Webhook** | **REPLACED** | Replaced by self-hosted Evolution API on AWS ECS. |
| **Legacy Baileys Node Service (`whatsapp-service`)** | **ARCHIVED** | Archived in `docs/archive/legacy-baileys-prototype/`. Not active. |

---

## 4. CURRENT PRODUCTION INFRASTRUCTURE & HOSTING

### A. Hostinger VPS & Coolify Management
All production web services and backend database engines run on the dedicated Hostinger VPS managed via **Coolify**:
- **Frontend Container**: Nginx Alpine serving static production build from `/usr/share/nginx/html/`.
  - Docker container naming filter: `4s2tyq1...`
- **Backend Supabase Stack**: Self-hosted Docker Compose under `/data/coolify/services/rufiptlacf2ik0phgii71ekq/`:
  - `supabase-db` (PostgreSQL 15+)
  - `supabase-auth` (GoTrue auth service)
  - `supabase-kong` (API Gateway exposing `https://api.ronsbergerhmo.io`)
  - `supabase-rest` (PostgREST)
  - `supabase-storage` (S3/Local storage)
  - `supabase-edge-functions` (Deno runtime serving edge functions mounted at `/data/coolify/services/rufiptlacf2ik0phgii71ekq/volumes/functions/`)

### B. Invitation Expiration Policy & Email Delivery
- All staff and hospital user email invitation tokens and OTPs expire after **7 days (604,800 seconds)**.
- Configured in Coolify Docker Compose for `supabase-auth`:
  - `GOTRUE_MAILER_OTP_EXP: 604800`
  - `GOTRUE_OTP_EXP: 604800`
- Transactional invitations are sent via **Brevo API** from `Ronsberger HMO <noreply@ronsbergerhmo.io>`.

### C. WhatsApp Automation & Inbound Webhook Architecture
- **Active Provider**: **Evolution API** running on AWS ECS (`https://wa-api.claimspilot.online`).
- **Webhook Endpoint**: `https://api.ronsbergerhmo.io/functions/v1/whatsapp-webhook`
  - Requires the `x-webhook-token` header to match the `EVOLUTION_WEBHOOK_TOKEN` secret configured in Coolify and Evolution API; never store its value in Git.
  - Inbound webhook inserts into `whatsapp_messages` and triggers `whatsapp-worker`.
- **Queue Sweeper Cron Backstop**:
  - The host VPS executes `/root/whatsapp_worker_cron.sh` every minute via system crontab (`* * * * * /root/whatsapp_worker_cron.sh`).
  - This guarantees that even if a network hiccup or webhook interruption occurs, queued inbound messages are automatically picked up and processed.
- **AWS Lambda / SQS Worker**: Paused. Do NOT re-enable AWS Lambda or create competing polling mechanisms.

### D. Coolify Service Configuration Persistence Rule
- Coolify stores its Docker Compose template inside its PostgreSQL database (`coolify-db`) in `services.docker_compose_raw`.
- **CRITICAL**: Whenever environment variables or compose configurations are updated in `/data/coolify/services/rufiptlacf2ik0phgii71ekq/docker-compose.yml`, they MUST ALSO be updated in Coolify's database:
  - `docker cp /path/to/docker-compose.yml coolify-db:/tmp/compose.yml`
  - `docker exec coolify-db psql -U coolify -d coolify -c "UPDATE services SET docker_compose_raw = pg_read_file('/tmp/compose.yml') WHERE id = 1;"`
  - `docker exec coolify-db rm /tmp/compose.yml`
  This ensures that Coolify never overwrites or wipes out custom Edge Functions environment variables (`EVOLUTION_WEBHOOK_TOKEN`, `BREVO_API_KEY`, etc.) when saving from the Coolify dashboard.

---

## 5. CODEBASE DIRECTORY STRUCTURE

```text
/
├── .agents/
│   └── AGENTS.md                  <-- System rules for AI coding assistants
├── AI_INSTRUCTIONS.md             <-- This master file
├── DEPLOYMENT_GUIDE.md            <-- Deployment commands and ops reference
├── WHATSAPP_SETUP.md              <-- Evolution API / WhatsApp documentation
└── uicodereqeust-main/            <-- Primary application repository
    ├── src/                       <-- React 18, TypeScript, Vite, TailwindCSS
    │   ├── components/            <-- Reusable UI components & modals
    │   ├── features/              <-- Domain modules (claims, hospital, payments, reports)
    │   ├── hooks/                 <-- Custom React hooks
    │   ├── lib/                   <-- Utilities, API clients, tariff parsers
    │   └── pages/                 <-- Application views (Dashboard, Register, Login)
    ├── supabase/
    │   ├── functions/             <-- Deno Edge Functions (send-otp, whatsapp-worker, etc.)
    │   └── migrations/            <-- Idempotent PostgreSQL schema migrations
    └── docs/
        └── archive/               <-- Archived historical prototypes (Baileys, Meta webhook)
```

---

## 6. ENGINEERING & QUALITY GATES (MUST PASS BEFORE ANY COMMIT)

Every AI builder must uphold these non-negotiable quality checks:

1. **Explicit Imports Verification**:
   - Every added React hook (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`) MUST be explicitly imported at the top of the file.
   - Every Lucide icon, UI component, and TypeScript interface must have a valid import. Never leave undefined references.
2. **TypeScript Compilation Gate**:
   - Run `cd uicodereqeust-main && npx tsc --noEmit`.
   - **Must complete with 0 errors**.
3. **Unit Test Suite Gate**:
   - Run `cd uicodereqeust-main && npm test -- --run`.
   - All test suites present in the repository must pass with 0 failures.
4. **Mobile Responsive Guardrails**:
   - **Checkboxes**: Must be strictly sized to `16px × 16px` (`h-4 w-4 rounded-[4px]`) and explicitly excluded from touch-target min-height styles.
   - **Bottom Navigation**: Mobile `<main>` container must have `pb-24` padding to prevent sticky bottom navigation bars from covering buttons or content.
   - **Text Overflow**: All dynamic labels, emails, phone numbers, and badges must use `break-words` and `[overflow-wrap:anywhere]` to prevent horizontal overflow on screens under 380px width.
5. **Security & Secrets**:
   - Never commit API keys, service role keys, SSH private keys, or passwords.
   - Always read credentials from environment variables or Supabase Vault.

---

## 7. HOW TO DEPLOY TO PRODUCTION

### Step 1: Build Frontend Assets
```bash
cd uicodereqeust-main
npm run build
```

### Step 2: Deploy to Hostinger VPS Nginx Container
Use the production application in Coolify to deploy the latest `main` commit. Follow `DEPLOYMENT_GUIDE.md`; do not copy files into a running container or use a branch other than `main`.

### Step 3: Deploy Edge Functions
Sync updated functions in `uicodereqeust-main/supabase/functions/` to `/data/coolify/services/rufiptlacf2ik0phgii71ekq/volumes/functions/` on the VPS and restart the `supabase-edge-functions` container.

---

## 8. SUMMARY FOR AI AGENTS

- **Branch**: `main` only.
- **Brand**: Ronsberger HMO (`app.ronsbergerhmo.io`).
- **No Firebase, No Medicode, No Managed Supabase `optistuvyeiojlgmkdks`**.
- **Check Imports**: Always.
- **TypeScript `tsc`**: Must be 0 errors.
