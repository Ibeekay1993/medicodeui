# Role Dashboard Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, with review checkpoints.

**Goal:** Apply the approved admin-dashboard visual hierarchy to admin mobile, utilization, claims, finance, and hospital dashboards while correcting Action Needed counts and preventing partial hospital totals.

**Architecture:** Keep the shared dashboard shell and role permissions unchanged. Centralize the Action Needed status list for queue and dashboard filtering, pass its exact database count into overview components, and render separate role-specific dashboard sections using shared presentation primitives. Keep hospital totals on the tenant-scoped aggregate RPC and fail closed when it cannot provide complete values.

**Tech Stack:** React, TypeScript, React Router, Tailwind CSS, TanStack Query, Recharts, Supabase/PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-11-12-role-dashboard-refresh-design.md`

## Global Constraints

- Preserve the existing role checks, hospital tenant scope, Supabase RLS, business actions, and audit behavior.
- Never sum a capped display sample and present it as a complete total.
- Treat aggregate errors, missing fields, invalid numbers, and inconsistent counts as unavailable; do not coerce them to zero.
- Use the exact Action Needed statuses: `pending`, `pending_referral`, `pending_authorization`, and `info_provided`.
- Preserve the current desktop admin layout; compact the three KPIs at 360–430px mobile widths.
- Keep shared navigation/sidebar behavior and authentication unchanged; increase inactive menu contrast and keyboard focus visibility.
- Expose the current authorization status breakdown through a protected aggregate RPC; do not infer that every residual status needs action.

---

### Task 1: Align Action Needed status filters and exact count

**Files:**
- Create: `src/features/dashboard/constants/requestStatuses.ts`
- Modify: `src/features/dashboard/pages/RequestsPage.tsx`
- Modify: `src/features/dashboard/services/requestsService.ts`
- Modify: `src/features/dashboard/pages/DashboardHome.tsx`

**Interfaces:**
- Export `ACTION_REQUIRED_AUTHORIZATION_STATUSES` as a readonly tuple from `requestStatuses.ts`.
- `RequestsPage` and `requestsService` use that tuple for their Action Needed filters.
- `DashboardHome` issues a head-only exact count query with the same tuple and stores `{ count, error }` separately from the broader dashboard totals.

- [x] Read the current role-specific authorization RLS and queue query behavior before changing the count query.
- [x] Replace duplicate Action Needed status arrays in the queue page and service with the shared constant.
- [x] Fetch `count: "exact", head: true` for the shared statuses under the current signed-in role; show the count as unavailable if the query errors or returns no count.
- [x] Ensure the Needs attention link opens the Action Needed filter regardless of any prior `sessionStorage` filter selection, using a `status=action_required` URL parameter and initializing the queue from it.
- [x] Add a protected database-side aggregate for exact counts by authorization status.
- [ ] Compare the exact head count to the full filtered queue count in the production SQL Editor after deployment; never compare it to the current page's displayed row count alone.

### Task 2: Compact the admin mobile summary and correct its outcome bar

**Files:**
- Modify: `src/components/dashboard/AdminOverview.tsx`
- Modify: `src/features/dashboard/pages/DashboardHome.tsx`

**Interfaces:**
- Add explicit Action Needed count and error state to `AdminOverviewProps.auth`.
- Keep `total`, `approved`, `rejected`, `historical`, and authorized amount as separate values.

- [x] Change the mobile KPI grid to three compact columns while preserving the current `sm` and desktop appearance; reduce mobile value size and vertical padding, and allow short labels to wrap cleanly.
- [x] Increase separation between each Needs attention value and chevron; keep the left label flexible and the right value/chevron group anchored to the row's right edge.
- [x] Use the exact Action Needed count for the authorization attention item; if unavailable, show a clear unavailable label instead of `0`.
- [x] Derive `Other statuses` from exact per-status counts; include it in the outcome bar so its categories still reconcile to live total, and provide a status-by-status disclosure.
- [x] Mark the outcome breakdown unavailable if component counts exceed the live total or if any required count is invalid.

### Task 3: Build role-specific staff dashboard overviews

**Files:**
- Create: `src/features/dashboard/components/RoleDashboardOverview.tsx`
- Modify: `src/features/dashboard/pages/DashboardHome.tsx`
- Reuse without changing permissions: existing authorization, claim, and finance report/queue routes.

**Interfaces:**
- The overview component receives role, base path, loading/error state, exact aggregate values, and a bounded recent-record list for its role.
- Utilization manager/lead use authorization values; claims/claims lead use claim values; finance uses payment and batch values.

- [x] Build shared presentational primitives for a compact headline row, attention list, labeled pipeline, and recent-record panel; keep them in the dashboard component folder.
- [x] Add a utilization overview with total requests, Action Needed, approval rate, authorization outcomes, recent requests, and links to the filtered review queue and reports.
- [x] Add a claims overview with review/contest status counts and values, recent claims, and links to the claims queue and reports.
- [x] Add a finance overview with awaiting-payment count/value, paid value, batch states, recent batches, and links to awaiting, paid, and batch routes.
- [x] Use explicit `isClaims`/`isFinance`/`isUtilizationManager` predicates consistently for both data and labels so claims leads receive claims controls and chart labels.
- [x] Keep recent lists bounded for display only; derive all KPI counts and amounts from exact aggregates, never from these lists.
- [x] Show chart errors as unavailable with retry rather than synthesizing an empty bucket series after an RPC error.

### Task 4: Make the hospital dashboard fail closed on aggregate errors

**Files:**
- Modify: `src/features/hospital/services/hospitalService.ts`
- Modify: `src/features/hospital/pages/HospitalPortalPage.tsx`

**Interfaces:**
- `HospitalService.getDashboardData` returns a complete validated aggregate result or throws a descriptive error; it no longer computes totals from capped rows.
- `HospitalPortalPage` reads `isError` and `refetch` from the dashboard query and provides an unavailable state with retry.

- [x] Validate each required numeric property returned by `get_hospital_dashboard_metrics`; reject missing, non-finite, or negative values.
- [x] Remove the client-side fallback queries and the `limit(1000)` sums from `getDashboardData`.
- [x] Keep the no-hospital/unstarted-onboarding empty state distinct from aggregate failure.
- [x] When the RPC fails, hide stale/default zero metrics, show an unavailable message and retry action, and keep facility-scoped actions/navigation usable.
- [x] Confirm the RPC remains called with the current facility ID and do not change `assert_hospital_facility_access` or its permissions.

### Task 5: Review, typecheck, and release commit

**Files:**
- Review all files changed by Tasks 1–4.

- [x] Check the final diff for accidental permission, tenant-scope, status, or workflow changes.
- [x] Run `npx tsc --noEmit` from `uicodereqeust-main/`.
- [x] Run `git diff --check` and inspect `git status`.
- [x] Run the production frontend build.
- [ ] Do not run the automated test suite in this task; verify query/count parity and role-specific mobile behavior manually when the deployed environment is available.
- [ ] Commit the validated dashboard changes directly to `main` and push `main`.
- [ ] Report that production UI deployment still requires the Coolify frontend deployment; do not claim it is live until build metadata matches the pushed commit.
