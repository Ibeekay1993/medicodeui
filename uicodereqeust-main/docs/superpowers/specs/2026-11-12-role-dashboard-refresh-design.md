# Role Dashboard Refresh Design

Date: 2026-11-12

## Context

The admin overview now has a clearer hierarchy than the older role dashboards. Utilization, claims, and finance still use role branches inside `DashboardHome`; hospitals use a separate `HospitalPortalPage`. The goal is to extend the admin overview's restrained visual language without giving each role the same metrics or exposing data outside its existing scope.

The user also reported that the admin mobile KPI section is too tall, the attention value sits too close to its chevron, and the attention count (7) does not agree with the Action Needed queue (2).

## Findings

1. `RequestsPage` defines Action Needed as the exact statuses `pending`, `pending_referral`, `pending_authorization`, and `info_provided`.
2. `get_dashboard_stats()` currently derives `pending` as `total - approved - rejected`; `AdminOverview` independently derives its attention count the same way. The residual can include statuses outside Action Needed, which explains why the dashboard can show more items than the queue.
3. The admin KPI container uses one column below `sm`, making three headline values stack vertically on mobile.
4. The hospital dashboard first calls the tenant-scoped `get_hospital_dashboard_metrics` aggregate, but if it fails it falls back to fetching at most 1,000 authorization and claim rows and summing them in the browser. Its page also defaults missing metrics to zero. That can show partial or misleading totals after an aggregate failure.
5. `DashboardHome` identifies claims leads as claims roles for data loading, but some display labels and shortcut selection still compare only `role === "claims"`.

## Decision

Use shared visual patterns and separate role-specific overview modules. Do not duplicate `AdminOverview` for every role and do not rewrite the common navigation shell. Keep existing role authorization, tenant scoping, business actions, and RLS behavior.

## Shared visual behavior

- Preserve the desktop admin layout.
- On 360–430px mobile widths, render the three admin headline KPIs in one compact three-column row. Use compact type and spacing, wrapping labels as needed; retain the full metric names for accessibility.
- Increase the horizontal separation between each Needs attention value and its chevron, keeping the value aligned at the right edge and the row a usable touch target.
- Use sentence-case labels, tabular numbers, neutral card surfaces, restrained semantic status colors, clear loading/empty/error states, and a visible refresh path where data can be retried.
- Show only non-zero attention items. When there are none, show a single calm empty-state line.
- Keep charts and records responsive; tables may become compact record cards on mobile where necessary.

## Dashboard content by role

### Admin

- Keep the current three headline metrics, authorization outcomes, and claims/payment pipeline on desktop.
- Make the mobile headline row compact as described above.
- Define Action Needed using the same four statuses as the Action Needed queue. Pass that explicit count to the overview; do not infer it by subtracting approved and rejected from total.
- Keep funnel totals reconcilable by showing any remaining unclassified/non-actionable statuses in a distinct Other statuses segment instead of counting them as Action Needed.
- Preserve full-precision values on hover or tap when displaying compact currency.

### Utilization manager and lead

- Prioritize total requests, requests awaiting a decision, and approval rate.
- Include an authorization outcome breakdown, non-zero queue/SLA attention items, recent review activity, and direct links to the filtered authorization queue and reports.
- Use the exact queue status definition for attention counts.

### Claims and claims lead

- Prioritize claims awaiting review, contested claims, and the claims value/volume needed for triage.
- Show a claims pipeline with explicit statuses and amounts, plus recent claims and queue/report links.
- Use the claims-role predicate consistently for both data and presentation so claims leads receive the same claims labels and actions.

### Finance

- Prioritize awaiting-payment count/value, paid value, and batches requiring action.
- Show the payment/settlement pipeline and recent batches with explicit, reconciled values; explain any approved/paid/batch-value gap where the source data supports it.
- Keep clinical authorization details out of the finance view unless the current finance permissions already allow them.

### Hospital

- Keep all counts and records scoped to the signed-in facility.
- Prioritize pending authorizations, claims under review, and payment status; highlight approaching contest deadlines only when present.
- Show recent authorizations and claims in a mobile-friendly form.
- Remove client-side totals derived from the 1,000-row fallback. If the aggregate RPC fails, show unavailable totals and a retry action rather than zero or a partial sum.

## Data and security constraints

- Use database-side aggregates for totals and money values; never sum a capped display sample and present it as a complete total.
- For Action Needed, keep the dashboard aggregate and queue aligned to the four statuses currently filtered by `RequestsPage`. Apply compatible tenant and visibility rules.
- Treat aggregate errors, missing fields, invalid numbers, and inconsistent counts as unavailable; do not coerce them to zero.
- Preserve existing Supabase RLS, role checks, hospital tenant checks, audit behavior, and server-side validation.
- Do not introduce admin/global metrics into hospital, claims, or finance dashboards without verifying existing authorization.

## Implementation sequence

1. Correct the Action Needed aggregate and the admin mobile KPI/row spacing.
2. Refactor the shared staff dashboard into role-specific overview sections for utilization, claims, and finance while keeping their data sources role-scoped.
3. Update the hospital overview to fail closed on aggregate errors and remove capped-sample aggregation.
4. Verify desktop and 360–430px mobile layouts, queue-to-count agreement, role-specific links, loading/empty/error behavior, and tenant isolation.

## Out of scope

- Changing authorization or claims workflow rules.
- Changing the shared navigation/sidebar or authentication flow.
- Adding trends or period comparisons unless complete, trustworthy aggregate data is available for the relevant role.
- Changing database permissions except where a narrowly scoped aggregate is required and reviewed.
