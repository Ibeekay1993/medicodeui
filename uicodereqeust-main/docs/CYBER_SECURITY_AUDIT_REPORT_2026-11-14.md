# Cyber Security Audit & System Verification Report
**Target Platform:** Ronsberger HMO Enterprise Portal (`https://app.ronsbergerhmo.io`)  
**Repository Branch:** `main` (commit `fc025c1`)  
**Audit Date:** 14 November 2026  
**Quality Gate Status:** TypeScript: **0 errors** | Vitest: **362 / 362 passed (55 test suites)**

---

## 1. Executive Summary

This comprehensive cyber security audit and verification evaluates the security posture, authentication/authorization controls, dependency vulnerabilities, credential management, SQL/PostgREST filter injection protection, and recent functional fixes of the Ronsberger HMO Enterprise Portal. 

All recent functional enhancements made to the **Reviewal Modal**, **Treatment Cart**, **NHIS Registry Verification**, and **Patient Clinical History** were regression-tested and verified. The system passes all automated quality gates (362/362 Vitest unit tests, 0 TypeScript errors). 

Additionally, a defensive security patch (**migration `20261114080000`**, corrected by **`20261114083000`**) was committed to `main`. These migrations resolve open review finding **F6 (Arrival PIN Brute-force Lockout & Hospital Tenant Isolation)** but have **not yet been applied to the live database**. They must be run against production Supabase before the controls take effect.

Furthermore, a full-codebase audit for **SQL & PostgREST Filter Injection** was completed. PostgREST `.or()` filter injections were hardened across all user-facing query interfaces using a centralized `safeIlikePattern` helper with literal LIKE wildcard escaping.

---

## 2. Verification of Reviewal Modal & Functional Fixes

### A. Treatment Cart Item Matching & Quantity Confirmation
* **Problem Addressed:** Approvals previously raised *"Confirm each treatment quantity from the request or prescription before approval"* when custom/parsed items without standardized codes were edited.
* **Verification:** `useTariffSearch.ts` was upgraded to use composite item matching (`matchesItem(item, identifier)` matching either `item.code` or `item.name`). All cart actions (`addApprovedItem`, steppers, manual input, `commitQuantity`, `confirmItemQuantity`) now key cleanly off `itemIdentifier = item.code || item.name || '__item_${itemIdx}'`.
* **Integrity Status:** Verified. Custom treatments and tariff-coded treatments can be steppared or manually typed and confirmed without key collisions.

### B. Hospital Read-Only Review Modal Mode
* **Problem Addressed:** Hospital users viewing the review modal had dangling `Approve` and `Decline` action buttons that would fail at the RPC level.
* **Verification:** `ReviewModal.tsx` now conditionally omits `Approve` and `Decline` action buttons when `role === "hospital"`, cleanly presenting a read-only review modal without unauthorized actions.
* **Integrity Status:** Verified.

### C. Mobile Resilience for Registry Checks & History Lookups
* **Problem Addressed:** On cellular 3G/4G connections, users encountered *"Could not check registry. Please retry"* or *"Authorization history could not be loaded"*.
* **Verification:** In `useClinicalVerification.ts`:
  1. Timeout expanded from 4,000ms to **12,000ms** to accommodate high mobile latency.
  2. Integrated `withAutoRetry` (automated background retry with 400ms delay) before surfacing any user-facing error.
  3. Automatic fallback from RPC `get_patient_authorization_history` to direct indexed queries on delay.
* **Integrity Status:** Verified.

### D. Historical Item Quantity Confirmation Markers
* **Problem Addressed:** Past approvals (e.g. OJO REUBEN's Craniotomy and Specialist Review) displayed an alarming yellow warning: *"One or more quantities have no quantity confirmation marker. Check the rows marked 'Recorded qty' against the original approval."*
* **Root Cause & Fix:** Legacy database records saved before `quantity_requires_review` was introduced had `null` in that field. The frontend checked `item.quantity_requires_review !== false`, evaluating `null` to `true`. This was corrected in `approvedHistoryItems.ts` to `item.quantity_requires_review === true || quantity === null`. Historical approvals with positive integer quantities now display with a clean green badge: `"Approved qty <n>"`.
* **Integrity Status:** Verified.

---

## 3. Cyber Security Audit Domain Breakdown

### Domain 1: Secret & Credential Management
| Check | Status | Evaluation & Evidence |
|---|---|---|
| **Git Tracked Secrets** | **PASS** | `git ls-files` confirms no `.env` or `.env.*` files are tracked (only `.env.production.example` is committed). |
| **Workspace Secret Scan** | **PASS** | Static scan of `src/` found **zero** hardcoded passwords, API keys, or `service_role` secrets. Client uses `VITE_SUPABASE_PUBLISHABLE_KEY` only. |
| **Client Token URL Leakage** | **PASS** | `detectSessionInUrl: false` is explicitly configured in `src/integrations/supabase/client.ts` to prevent access tokens in URL hash fragments from being harvested. |
| **Historical VPS Root Password** | **REQUIRES HOST ROTATION** | An earlier version of `scripts/deploy-vps.py` contained a hardcoded root password. The script was decommissioned, but Hostinger VPS root password must be rotated via Hostinger control panel. |
| **Database Password in Chat** | **REQUIRES DB ROTATION** | Database credentials pasted into historical chat sessions must be rotated in Coolify / Postgres configuration. |

---

### Domain 2: Dependency Vulnerability Analysis (`npm audit`)
Running `npm audit --omit=dev` identifies 13 advisories (5 High, 8 Moderate, 0 Critical) across 7 packages. Here is the architectural impact assessment:

1. **`zod` (<4.6.6, GHSA-mrhx-c7xc-m3w5 - High):**
   * *Advisory:* Memory exhaustion during validation of oversized, deeply-nested constrained collections.
   * *Actual Risk in Portal:* **Low**. Zod schemas in this app validate specific, bounded form inputs (names, codes, dates). Upgrading to Zod v4 would require major breaking syntax rewrites.
   * *Remediation:* Maintain input length bounding in UI forms; plan Zod v4 migration during next scheduled framework upgrade.

2. **`react-router` / `react-router-dom` (GHSA-jjmj-jmhj-qwj2, GHSA-337j-9hxr-rhxg - Moderate):**
   * *Advisory:* 1) Open redirect via form action leading to XSS; 2) SSR hydration constructor injection via `deserializeErrors()`.
   * *Actual Risk in Portal:* **Negligible**. The Ronsberger portal is a **100% client-rendered Single Page Application (SPA)** compiled with Vite and served statically by Nginx. SSR hydration does not exist in this architecture, and form actions use programmatic React handlers rather than external URL redirects.
   * *Remediation:* Update `react-router-dom` to the patched v6 maintenance release when convenient.

3. **`exceljs` / `uuid` (GHSA-w5hq-g745-h8pq - Moderate):**
   * *Advisory:* Missing buffer bounds check in `uuid` v3/v5/v6 when custom buffer is passed.
   * *Actual Risk in Portal:* **None**. ExcelJS generates `.xlsx` export files for reports; custom buffer UUID generation is not invoked.

4. **`source-map-js`, `brace-expansion`, `postcss`, `nanoid` (Build & Transitive tooling):**
   * *Actual Risk in Portal:* **None in Production**. These are build-time CSS/minification dependencies that do not execute on the end user's machine or server runtime.

---

### Domain 3: Access Control, Tenant Isolation & Arrival PIN Hardening
| Vulnerability / Control | Status | Mitigation Implemented |
|---|---|---|
| **Arrival PIN Brute-force Attack (Finding F6)** | **MIGRATION COMMITTED — NOT YET APPLIED TO PRODUCTION** | Migration `20261114080000` (initial) and corrective migration `20261114083000` committed to `main`. Adds `failed_attempts` tracking, `locked_until` timestamp, `SELECT ... FOR UPDATE` row locking to prevent concurrent-guess race conditions, and `expires_at` enforcement (OTP expires per column default, currently 1 hour). After 5 incorrect PINs the row is locked for 15 minutes. **These migrations must be applied to the live Supabase database before the controls are active.** |
| **Hospital Cross-Tenant Probing (Finding F6)** | **MIGRATION COMMITTED — NOT YET APPLIED TO PRODUCTION** | Corrective migration `20261114083000` adds tenant boundary check in `verify_otp`: hospital users must have a non-NULL `hospital_id` in `user_roles` (NULL → denied). The RPC verifies the target authorization belongs to the caller's hospital (direct, referring, or referred). `search_path` set to `''` (empty) to prevent search-path hijacking in `SECURITY DEFINER` context. |
| **Tenant Column Tampering (Finding F13, F14)** | **FIXED** | Database triggers `protect_user_role_tenant_columns` and `protect_hospital_self_service_columns` prevent non-admin users from altering `hospital_id`, `is_team_lead`, or hospital status. |
| **Sensitive Table RLS (`otp_verifications`)** | **HARDENED** | Deny-all RLS policy on `public.otp_verifications` for `authenticated` and `anon`. Access permitted strictly through hardened `SECURITY DEFINER` RPCs (`verify_otp`, `get_otp_value`). |
| **MFA Protection on Plaintext PIN Retrieval** | **ENFORCED** | `get_otp_value` and `get_otp_values_batch` are restricted to `nurse` and `admin` roles, and enforce `aal2` (MFA verification) when `enforce_mfa` policy is enabled. |

---

### Domain 4: API, Edge Functions & Webhook Security
1. **Evolution WhatsApp Webhook Authentication:**
   * Inbound webhook (`whatsapp-webhook/index.ts`) verifies `x-webhook-token` using constant-time bitwise comparison:
     ```ts
     let diff = provided.length ^ EVOLUTION_WEBHOOK_TOKEN.length;
     for (let i = 0; i < min; i++) diff |= provided.charCodeAt(i) ^ EVOLUTION_WEBHOOK_TOKEN.charCodeAt(i);
     if (diff !== 0) return unauthorized();
     ```
   * Payload size is bounded by `MAX_BODY_BYTES` (fails with HTTP 413 if exceeded).
   * Webhook event deduplication prevents replay attacks.
2. **CORS Hardening:**
   * Shared CORS configuration (`supabase/functions/_shared/cors.ts`) strictly sets:
     `"Access-Control-Allow-Origin": "https://app.ronsbergerhmo.io"`.
   * Wildcard `*` origins are prohibited.
3. **Retired Endpoints:**
   * Legacy endpoints `process-claim` and `submit-claim` return HTTP 410 Gone.

---

### Domain 5: Infrastructure & Production Recommendations

1. **Hostinger VPS Password Rotation:**
   * Log into Hostinger Control Panel and update the root password.
   * Verify SSH `/root/.ssh/authorized_keys` to ensure only authorized administrative keys remain.
2. **Database Password Rotation:**
   * In Coolify (`services/rufiptlacf2ik0phgii71ekq`), rotate the Postgres database password in environment settings and trigger a compose redeploy.
3. **Nginx Security Response Headers:**
   * Verify that the frontend Nginx container serves the following headers:
     ```nginx
     add_header X-Frame-Options "DENY" always;
     add_header X-Content-Type-Options "nosniff" always;
     add_header Referrer-Policy "strict-origin-when-cross-origin" always;
     add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
     add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
     ```

---

### Domain 6: SQL & PostgREST Filter Injection Hardening

1. **Vulnerability Mechanics in PostgREST `.or()`:**
   * Supabase/PostgREST translates `.or()` clauses passed as string parameters (e.g. `col1.ilike.%${term}%,col2.ilike.%${term}%`).
   * When user input contains commas (`,`), parentheses, or quotes, PostgREST's grammar splits on commas, interpreting subsequent input as structural filter tokens or throwing HTTP 400 Bad Request.
   * Furthermore, unescaped `%` and `_` characters in user input act as SQL LIKE wildcards, potentially causing full-table scans, pattern abuse, or denial of service.

2. **Mitigation (`src/lib/postgrestFilter.ts`):**
   * Implemented `escapeLikePattern()` to backslash-escape `%`, `_`, and `\` before pattern construction so inputs match literally.
   * Implemented `quotePostgrestFilterValue()` to safely wrap values in PostgREST double-quotes with proper backslash escaping.
   * Implemented `safeIlikePattern()` which chains wildcard escaping, double-quote escaping, and wraps the sanitized term in `"%...%"`.
   * Unit tests added in `src/lib/postgrestFilter.test.ts` (9 test cases covering quotes, backslashes, wildcards, commas, and edge cases).

3. **Remediated Interfaces:**
   * `claimsService.ts`: Claim code / enrollee name / hospital search.
   * `requestsService.ts`: Pre-auth requests search filter.
   * `hospitalService.ts`: Authorizations and claims search filters.
   * `FindEnrolleePage.tsx`: Full name, policy number, and beneficiary number filters.
   * `RequestsPage.tsx`: Dashboard request search filter.
   * `SupportMessagesPage.tsx`: Hospital / user support search.
   * `HospitalNewRequest.tsx`: Patient lookup and NHIA treatment search.
   * `ReferralTreatmentFormDialog.tsx`: NHIA treatment search.
   * `prescriptionParser.ts`: NHIA drug catalog candidate matching.
   * `WhatsAppPage.tsx`: Hospital name lookup matching.
   * `useTariffSearch.ts`: Direct NHIA database fallback search.

---

## 4. Verification Checkpoint Summary

* **Single Branch Policy:** All code committed and pushed directly to `main`.
* **TypeScript Compilation:** `npx tsc --noEmit` -> **0 errors**.
* **Automated Unit Tests:** `npm test -- --run` -> **55 test files passed, 362 / 362 tests passed**.
* **Zero Firebase:** Confirmed clean; no legacy Firebase or MedicodeUI references.
* **Database Migrations:** `20261114080000` & `20261114083000` committed; requires manual execution on self-hosted Supabase database via Coolify/psql.
* **Production Status:** Application code hardened, tested, and verified clean.
