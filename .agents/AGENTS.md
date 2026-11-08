# AI Coding Agent Directives & Architecture Rules
# Ronsberger HMO Enterprise Portal

This repository is governed by the following strict engineering and architectural rules. All AI assistants, agents, and paired programming tools MUST comply.

## 1. Single Branch Policy (`main` ONLY)
- **ONLY ONE BRANCH**: All active development, fixes, and production releases must exist on `main`.
- Do NOT create any branch, temporary branch, pull-request branch, or branch-based worktree. Make every change directly on `main`.
- Commit and push validated changes directly to `main`. If an unexpected branch exists, preserve any unique work on `main` first, then delete the branch.
- Local repository and GitHub remote must contain only `main`, with `main` as the default and single source of truth.

## 2. Completely Decommissioned Infrastructure (Strictly Prohibited)
- **NO FIREBASE**: Firebase Hosting, Firebase Functions, `firebase deploy`, `firebase.json`, and `.firebaserc` are permanently removed. Never suggest or reintroduce Firebase.
- **NO MEDICODE / MEDICODEUI**: The legacy brand `medicode` and domain `medicodeui.web.app` are obsolete. Never redirect to them or use `medicode.com` emails (use `no-email@ronsbergerhmo.io` if fallback required).
- **NO MANAGED SUPABASE `optistuvyeiojlgmkdks`**: The old managed cloud project is dead. The frontend and backend must connect strictly to self-hosted Supabase. If environment variables are missing, fail explicitly.

## 3. Production Environment & Hosting
- **Production Web Application**: `https://app.ronsbergerhmo.io`
- **Production Backend API**: `https://api.ronsbergerhmo.io`
- **Hosting Infrastructure**: Dedicated Hostinger VPS managed with **Coolify**.
- **Frontend Container**: Nginx container (prefix `4s2tyq1...`), serving files from `/usr/share/nginx/html/`.
- **Backend Services**: Self-hosted Supabase Docker Compose under `/data/coolify/services/rufiptlacf2ik0phgii71ekq/`.
- **Edge Functions**: Volume mounted at `/data/coolify/services/rufiptlacf2ik0phgii71ekq/volumes/functions/`.
- **Invitation & OTP Expiration**: 7 days (`604800` seconds in `GOTRUE_MAILER_OTP_EXP` and `GOTRUE_OTP_EXP`).
- **WhatsApp**: Evolution API on AWS ECS. (AWS Lambda/SQS worker is paused; do not restart).

## 4. Mandatory Quality Gates Before Finishing Any Task
- **Explicit Imports**: Always check the top of the file when introducing React hooks (`useEffect`, `useState`, `useCallback`, etc.), components, or icons. Never leave undefined references.
- **TypeScript Compilation**: Always run `cd uicodereqeust-main && npx tsc --noEmit`. Must exit with 0 errors.
- **Test Suite**: Always run `cd uicodereqeust-main && npm test -- --run`. All tests must pass.
- **Mobile Responsiveness**:
  - Keep checkboxes locked to `16px × 16px` (`h-4 w-4 rounded-[4px]`) and excluded from touch-target min-height CSS rules.
  - Keep `pb-24` on mobile main content so bottom navigation never overlaps action buttons.
  - Use `break-words` and `[overflow-wrap:anywhere]` on all dynamic user text.

For full architecture details, refer to `AI_INSTRUCTIONS.md`.
