import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTION_REQUIRED_AUTHORIZATION_STATUSES } from "@/features/dashboard/constants/requestStatuses";

/**
 * Admin dashboard overview.
 *
 * Replaces the three grids of identical metric cards with:
 *  1. Three headline figures
 *  2. A "needs attention" list that only shows non-zero items
 *  3. An authorization outcome bar whose segments sum to the total
 *  4. A claims-to-payment pipeline
 */

export type AdminOverviewProps = {
  loading: boolean;
  basePath: string;
  /** True when full authorization counts could not be confirmed. */
  authError?: boolean;
  /** True when the authorized amount could not be confirmed. */
  authAmountError?: boolean;
  /** True when the queue-aligned action-required count could not be confirmed. */
  authPendingError?: boolean;
  authStatusBreakdownError?: boolean;
  authStatusCounts?: Array<{ status: string; count: number }>;
  /** True when claim totals could not be confirmed; values render as "—". */
  claimsError?: boolean;
  /** True when payment totals could not be confirmed; values render as "—". */
  paymentsError?: boolean;
  auth: {
    total: number;
    approved: number;
    rejected: number;
    /** Count using the same statuses as the Action Needed queue. */
    pending: number;
    otherStatuses: number;
    /** Imported legacy rows have no reliable decision state. */
    historical: number;
    authorizedAmount: number;
  };
  claims: {
    submitted: number;
    paid: number;
    contested: number;
    approvedValue: number;
  };
  payments: {
    awaitingCount: number;
    awaitingValue: number;
    paidValue: number;
    settledBatches: number;
    totalBatchValue: number;
  };
};

const fullNaira = (n: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(n || 0);

const compactNaira = (n: number) => {
  const value = n || 0;
  if (Math.abs(value) < 100_000) return fullNaira(value);
  return (
    "₦" +
    new Intl.NumberFormat("en-NG", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)
  );
};

const count = (n: number) => (n || 0).toLocaleString("en-NG");

const pct = (part: number, whole: number) =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "0%";

function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block animate-pulse rounded bg-slate-200", className)}
    />
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {aside ? <div className="text-xs text-slate-500">{aside}</div> : null}
      </header>
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

const DASH = "—";

export function AdminOverview({
  loading,
  basePath,
  authError = false,
  authAmountError = false,
  authPendingError = false,
  authStatusBreakdownError = false,
  authStatusCounts = [],
  claimsError = false,
  paymentsError = false,
  auth,
  claims,
  payments,
}: AdminOverviewProps) {
  const liveTotal = Math.max(auth.total - auth.historical, 0);
  const authTotalsValid =
    !authError &&
    [auth.total, auth.historical, auth.approved, auth.rejected].every(
      (value) => Number.isFinite(value) && value >= 0,
    ) &&
    auth.historical <= auth.total &&
    auth.approved + auth.rejected <= liveTotal;
  const authPendingValid =
    !authPendingError &&
    Number.isFinite(auth.pending) &&
    auth.pending >= 0 &&
    auth.approved + auth.rejected + auth.pending <= liveTotal;
  const authCountsValid = authTotalsValid && authPendingValid;
  // Historical rows have no decision state; keep them out of approval math.
  const open = authCountsValid ? auth.pending : 0;
  const approvalRate = !authTotalsValid ? DASH : pct(auth.approved, liveTotal);

  const attention = [
    {
      label: "Authorization requests awaiting a decision",
      value: authPendingError ? DASH : count(open),
      show: authPendingError || (authCountsValid && open > 0),
      to: `${basePath}/requests?status=action_required`,
    },
    {
      label: "Requests in other workflow statuses",
      value: count(auth.otherStatuses),
      detail: authStatusBreakdownError ? "Status names unavailable" : "See status breakdown below",
      show: authCountsValid && Number.isFinite(auth.otherStatuses) && auth.otherStatuses > 0,
      to: `${basePath}/requests`,
    },
    {
      label: "Contested claims",
      value: count(claims.contested),
      show: !claimsError && claims.contested > 0,
      to: `${basePath}/claims`,
    },
    {
      label: "Claims submitted, not yet reviewed",
      value: count(claims.submitted),
      show: !claimsError && claims.submitted > 0,
      to: `${basePath}/claims`,
    },
    {
      label: `Approved claims awaiting payment (${count(payments.awaitingCount)})`,
      value: compactNaira(payments.awaitingValue),
      show: !paymentsError && (payments.awaitingValue > 0 || payments.awaitingCount > 0),
      to: `${basePath}/claims`,
    },
  ].filter((i) => i.show);

  const segments = [
    { key: "approved", label: "Approved", value: auth.approved, bar: "bg-emerald-600", dot: "bg-emerald-600" },
    { key: "rejected", label: "Rejected", value: auth.rejected, bar: "bg-rose-600", dot: "bg-rose-600" },
    { key: "open", label: "Awaiting decision", value: open, bar: "bg-amber-500", dot: "bg-amber-500" },
    { key: "other", label: "Other statuses", value: auth.otherStatuses, bar: "bg-slate-300", dot: "bg-slate-300" },
    { key: "historical", label: "Historical imports", value: auth.historical, bar: "bg-slate-500", dot: "bg-slate-500" },
  ];

  const pipeline = [
    {
      label: "Submitted",
      primary: claimsError ? DASH : count(claims.submitted),
      secondary: "claims",
    },
    {
      label: "Approved",
      primary: claimsError ? DASH : compactNaira(claims.approvedValue),
      secondary: "approved value",
    },
    {
      label: "Paid",
      primary: claimsError ? DASH : count(claims.paid),
      secondary: paymentsError ? "claims" : `claims · ${compactNaira(payments.paidValue)}`,
    },
    {
      label: "Settled batches",
      primary: paymentsError ? DASH : count(payments.settledBatches),
      secondary: paymentsError ? "batches" : `${compactNaira(payments.totalBatchValue)} total value`,
    },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Headline figures */}
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
        <div className="min-w-0 bg-white px-2.5 py-3 sm:px-5 sm:py-4">
          <dt className="text-[10px] leading-tight text-slate-500 sm:text-xs">Authorized amount</dt>
          <dd
            className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-slate-900 sm:text-2xl"
            title={!authAmountError && Number.isFinite(auth.authorizedAmount) ? fullNaira(auth.authorizedAmount) : undefined}
          >
            {loading ? <Skeleton className="h-7 w-28" /> : authAmountError || !Number.isFinite(auth.authorizedAmount) ? DASH : compactNaira(auth.authorizedAmount)}
          </dd>
        </div>
        <div className="min-w-0 bg-white px-2.5 py-3 sm:px-5 sm:py-4">
          <dt className="text-[10px] leading-tight text-slate-500 sm:text-xs">Total requests</dt>
          <dd className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-slate-900 sm:text-2xl">
            {loading ? <Skeleton className="h-7 w-20" /> : !authTotalsValid ? DASH : count(auth.total)}
          </dd>
        </div>
        <div className="min-w-0 bg-white px-2.5 py-3 sm:px-5 sm:py-4">
          <dt className="text-[10px] leading-tight text-slate-500 sm:text-xs">Approval rate</dt>
          <dd className="mt-1 whitespace-nowrap text-base font-semibold tabular-nums text-slate-900 sm:text-2xl">
            {loading ? <Skeleton className="h-7 w-16" /> : approvalRate}
          </dd>
        </div>
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 2. Needs attention */}
        <Section title="Needs attention">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ) : attention.length === 0 ? (
            <p className="text-sm text-slate-500">
              {!authCountsValid || claimsError || paymentsError || authStatusBreakdownError
                ? "Some authorization, claim, or payment items could not be checked."
                : "Nothing needs attention."}
            </p>
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {attention.map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="flex min-h-[44px] items-center justify-between gap-4 py-2 text-sm text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <span className="min-w-0 flex-1">
                      {item.label}
                      {"detail" in item && item.detail ? <span className="ml-2 inline-block max-w-full truncate align-bottom text-xs text-slate-500" title={item.detail}>{item.detail}</span> : null}
                    </span>
                    <span className="ml-2 flex shrink-0 items-center gap-2 font-semibold tabular-nums text-slate-900">
                      {item.value}
                      <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 3. Authorization outcomes */}
        <Section title="Authorization outcomes" aside={!authCountsValid ? "Totals unavailable" : `${count(auth.total)} requests`}>
          {loading ? (
            <Skeleton className="h-3 w-full" />
          ) : !authCountsValid ? (
            <p className="text-sm text-rose-700" role="status">
              Authorization counts could not be confirmed. Retry to refresh the dashboard.
            </p>
          ) : (
            <>
              <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={segments.map((s) => `${s.label} ${count(s.value)}`).join(", ")}
              >
                {segments.map((s) =>
                  s.value > 0 ? (
                    <div
                      key={s.key}
                      className={s.bar}
                      style={{ width: `${(s.value / Math.max(auth.total, 1)) * 100}%` }}
                    />
                  ) : null,
                )}
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                {segments.map((s) => (
                  <li key={s.key} className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} aria-hidden="true" />
                      {s.label}
                    </div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                      {count(s.value)}
                    </div>
                    <div className="text-xs tabular-nums text-slate-500">{pct(s.value, auth.total)}</div>
                  </li>
                ))}
              </ul>
              <details className="mt-4 rounded-lg border border-slate-200">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                  Request counts by status
                </summary>
                <div className="border-t border-slate-100 px-3 py-3">
                  {authStatusBreakdownError ? (
                    <p className="text-sm text-amber-800">Status-level counts are unavailable. Run the dashboard status-breakdown migration and retry.</p>
                  ) : (
                    <>
                      <p className="mb-3 text-xs leading-relaxed text-slate-600">
                        Exact counts for each request status. Deferred records are excluded from active totals; referral statuses follow the existing approved-count reporting rule.
                      </p>
                      <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                        {authStatusCounts.map((row) => {
                          const statusLabel = row.status === "(blank)" ? "Blank status" : row.status.replace(/_/g, " ");
                          const isActionRequired = (ACTION_REQUIRED_AUTHORIZATION_STATUSES as readonly string[]).includes(row.status);
                          const isReferralWorkflow = ["referral_approved", "referral_accepted"].includes(row.status);
                          return (
                            <li key={row.status} className="flex min-h-8 items-center justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-b-0">
                              <span className="min-w-0 capitalize text-slate-700">
                                {statusLabel}
                                {isActionRequired ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium normal-case text-amber-900 ring-1 ring-inset ring-amber-200">Action Needed</span> : null}
                                {isReferralWorkflow ? <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium normal-case text-indigo-800 ring-1 ring-inset ring-indigo-200">Referral in progress</span> : null}
                              </span>
                              <span className="shrink-0 font-semibold tabular-nums text-slate-900">{count(row.count)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              </details>
            </>
          )}
        </Section>
      </div>

      {/* 4. Claims to payment pipeline */}
      <Section title="Claims and payments">
        <ol className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
          {pipeline.map((step, i) => (
            <li key={step.label} className="min-w-0 lg:border-l lg:border-slate-100 lg:pl-4 lg:first:border-l-0 lg:first:pl-0">
              <div className="text-xs text-slate-500">
                {i + 1}. {step.label}
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                {loading ? <Skeleton className="h-6 w-16" /> : step.primary}
              </div>
              <div className="text-xs text-slate-500">{step.secondary}</div>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

export default AdminOverview;
