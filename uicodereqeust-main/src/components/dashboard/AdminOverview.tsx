import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
  /** True when claim totals could not be confirmed; values render as "—". */
  claimsError?: boolean;
  /** True when payment totals could not be confirmed; values render as "—". */
  paymentsError?: boolean;
  auth: {
    total: number;
    approved: number;
    rejected: number;
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
  claimsError = false,
  paymentsError = false,
  auth,
  claims,
  payments,
}: AdminOverviewProps) {
  const liveTotal = Math.max(auth.total - auth.historical, 0);
  const authCountsValid =
    !authError &&
    [auth.total, auth.historical, auth.approved, auth.rejected].every(
      (value) => Number.isFinite(value) && value >= 0,
    ) &&
    auth.historical <= auth.total &&
    auth.approved + auth.rejected <= liveTotal;
  const authUnavailable = !authCountsValid;
  // Historical rows have no decision state; keep them out of approval math.
  const open = authCountsValid ? liveTotal - auth.approved - auth.rejected : 0;
  const approvalRate = authUnavailable ? DASH : pct(auth.approved, liveTotal);

  const attention = [
    {
      label: "Authorization requests awaiting a decision",
      value: count(open),
      show: authCountsValid && open > 0,
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
    { key: "open", label: "Open", value: open, bar: "bg-slate-300", dot: "bg-slate-300" },
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
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3">
        <div className="bg-white px-4 py-4 sm:px-5">
          <dt className="text-xs text-slate-500">Authorized amount</dt>
          <dd
            className="mt-1 text-2xl font-semibold tabular-nums text-slate-900"
            title={!authAmountError && Number.isFinite(auth.authorizedAmount) ? fullNaira(auth.authorizedAmount) : undefined}
          >
            {loading ? <Skeleton className="h-7 w-28" /> : authAmountError || !Number.isFinite(auth.authorizedAmount) ? DASH : compactNaira(auth.authorizedAmount)}
          </dd>
        </div>
        <div className="bg-white px-4 py-4 sm:px-5">
          <dt className="text-xs text-slate-500">Total requests</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {loading ? <Skeleton className="h-7 w-20" /> : authUnavailable ? DASH : count(auth.total)}
          </dd>
        </div>
        <div className="bg-white px-4 py-4 sm:px-5">
          <dt className="text-xs text-slate-500">Approval rate</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
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
              {authUnavailable || claimsError || paymentsError
                ? "Some authorization, claim, or payment items could not be checked."
                : "Nothing needs attention."}
            </p>
          ) : (
            <ul className="-my-2 divide-y divide-slate-100">
              {attention.map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-sm text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <span className="min-w-0">{item.label}</span>
                    <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums text-slate-900">
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
        <Section title="Authorization outcomes" aside={authUnavailable ? "Totals unavailable" : `${count(auth.total)} requests`}>
          {loading ? (
            <Skeleton className="h-3 w-full" />
          ) : authUnavailable ? (
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
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
