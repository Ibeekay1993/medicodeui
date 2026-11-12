# Security review disposition — 12 November 2026

This note records how the supplied review materials compare with the current checkout and which changes have been made. It is a source review, not a production security certification.

## Scope and evidence limits

Reviewed the supplied `DashboardHome.diff`, `AdminOverview.tsx`, standalone SQL migration, `Ronsberger_Security_Review.docx`, `files.zip`, and pasted second-pass notes against the current source and migrations. The ZIP contains the report and three SQL migrations; it does not contain the `test-harness` directory mentioned in the pasted notes. The report says its PostgreSQL attack proofs were run locally; that evidence could not be independently rerun from the supplied files.

No production database, Coolify host, Cloudflare configuration, deployed Edge Functions, or live environment settings were inspected or changed. A new SQL migration is still pending application to staging and production. The DOCX text was extracted, but page rendering was unavailable because LibreOffice was not installed; the review does not claim visual document verification.

## Finding disposition

| ID | Disposition in this checkout |
| --- | --- |
| F1 — Published demo credentials | Replaced the unsafe SQL seed with a disabled script that raises and points to the environment-guarded demo setup utility. Production accounts still require a read-only live query and cleanup if any exist. |
| F2 — Exposed `SECURITY DEFINER` helpers | Added selective revokes for the named helper functions and service-role grants in `20261112000000_security_lockdown_exposed_objects.sql`. This does not revoke the portal's other authenticated RPCs. Review the live function-privilege query after deployment. |
| F3 — Tables without RLS | The same migration enables RLS and revokes API-role table access for `whatsapp_outbound_ledger` and `referral_code_sequence`. Verify current live grants/policies after migration. |
| F4 — Public payment receipts | Migration makes `payment-receipts` private, removes the broad read policy and applies a 5 MB JPEG/PNG/PDF limit. Client upload now checks type and size before sending. Confirm legitimate finance/admin signed-URL access in staging. |
| F5 — Redundant worker secret check | `submit-authorization` now requires `WHATSAPP_WORKER_SECRET` on internal calls whenever that secret is configured; the API key alone no longer satisfies the second check. Runtime secrets and worker delivery were not inspected. |
| F6 — Arrival PIN controls | Open. No failed-attempt lockout or effective hospital ownership check was added; PIN lifetime and plaintext retrieval remain compatibility-sensitive. Requires a separate database/RPC change and referral-flow review. |
| F7 — Direct claim endpoint | Local `process-claim` and `submit-claim` endpoints now return HTTP 410 and direct claim status writes are removed. No repository caller was found. Deploy the Edge Function changes and check external/stale clients before calling this retired in production. |
| F8 — Hospital MFA policy | Open. Whether all hospital users must enroll in MFA is an operational policy and enrollment decision; no broad enforcement was introduced. |
| F9 — PostgREST filter injection | Partially addressed. Added a shared quoting helper and fixed dynamic filters in `search-nhia`, `parse-request-text`, and `whatsapp-worker`; `process-authorization` now uses exact equality for request lookup and exact normalized hospital-name matching. The retired claim endpoints no longer contain their old filters. Other UI filters remain to audit; RLS continues to constrain those browser queries. |
| F10 — Vulnerable dependencies | Open. The lockfile still resolves `react-router-dom` 6.30.4 and Zod 3.25.76; Vite remains on 5.4.21. The Vite dev server now binds to loopback by default, reducing the specific network exposure condition, but this does not patch Vite. Updating the lockfile could not be completed offline because the patched package metadata was not cached. Zod's fix is in v4, so this needs a compatibility migration. Re-run an online dependency audit and update the lockfile before production release. |
| F11 — Error codes, IDs, CORS and migration sprawl | Partially addressed: the two retired claim endpoints return 410 instead of HTTP 200. Identifier generation, environment-specific CORS, webhook rate/signature controls, and migration consolidation remain open. |
| F12 — Historical imports distort dashboard | Addressed in source and a new migration. Historical rows are shown separately and excluded from approval rate; partial/referral approved and rejected statuses use the report status definitions; pending is derived as the live-count remainder so funnel segments reconcile. Exact aggregates remain server-side; dashboard shows unavailable instead of a partial number when required counts fail. Migration `20261112030000_fix_dashboard_authorization_status_aggregation.sql` must be applied before deployed RPC results match the updated UI. |
| F13 — Hospital user changes their tenant | Added `20261112010000_protect_user_role_tenant_columns.sql`, guarding `hospital_id` and `is_team_lead` while preserving first-time linking to a hospital owned by that user. Inspect the live role/audit history before applying; staging attack and onboarding checks remain required. |
| F14 — Hospital reactivates itself | Added a protected-column trigger in `20261112020000_protect_hospital_status_and_audit_author.sql`. The supplied migration allowed `nurse` to bypass it; this checkout removes that bypass because current nurse/utilization role mapping and hospital RLS could otherwise let ordinary users undo suspension. Admin and service-role paths remain. Confirm with staging role tests. |
| F15 — Forged audit author | The same migration stamps `user_id`, `actor_user_id`, `actor_name`, and `actor_role` from the authenticated caller and canonical `user_roles`. This addresses author spoofing on insert, not privileged UPDATE/DELETE or tamper-evident external retention. |
| F16 — Security headers | Removed ineffective security-header meta tags; the deployment guide now requires actual response headers at the origin/CDN, CSP report-only rollout, and HTTPS checks before HSTS. No CDN/origin configuration was changed or verified. |
| F17 — Session persistence and idle timeout | The report's “no timeout” claim is stale in this checkout: `AuthContext` has inactivity and maximum-session timers (2 hours for hospital users; 5 hours for staff; 10-hour maximum). Supabase auth still persists tokens in localStorage, and legacy URL-token handling remains for compatibility. These were not changed here. |
| F18 — AI processing and privacy disclosures | Open. The worker sends inbound message content to configured AI providers. Provider contracts, data residency, legal basis, notices, retention, and DPIA require organizational/legal review; no compliance claim is made. |
| F19 — WhatsApp provider | Open. The source uses the existing Evolution/Baileys integration. A move to the official business platform requires provider setup, credentials, and cutover planning. |
| F20 — Accessibility | Partially addressed in the new admin overview with clearer hierarchy, readable labels, keyboard focus, and 44 px action rows. This is not a full-app WCAG audit; the report's counts were not independently reproduced. |
| F21 — Unused Sentry packages | Removed the unused Sentry React and Vite plugin packages from `package.json`, npm lockfile, and Deno lock. No Sentry initialization existed, so this removes unused code rather than adding monitoring. |
| F22 — Retention and data-subject requests | Open. Retention periods, statutory claims retention, export/deletion procedures, and audit requirements need a documented organizational/legal decision before destructive automation. |

## Local validation and rollout

- `npm run typecheck` passed after the dashboard integration.
- `git diff --check` passed before the final dashboard and dependency cleanup edits; rerun before commit.
- The automated test suite and a live PostgreSQL migration run were not performed in this review.
- Apply migrations `20261112000000` through `20261112030000` on staging, exercise normal staff/hospital/finance flows and denied tenant/status changes, then apply to production through the established migration process.
- Redeploy the frontend and the affected Edge Functions. Source changes alone do not update the running VPS or self-hosted Supabase function container.
- Before release, inspect production for demo accounts, unexpected `user_roles.hospital_id` changes, live grants/RLS, private receipt access, and response headers. Do not treat this note as proof those production checks passed.
