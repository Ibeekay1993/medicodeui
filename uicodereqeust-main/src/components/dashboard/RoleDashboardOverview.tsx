import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type RoleDashboardMetric = {
  label: string;
  value: string | number;
  detail?: string;
  fullValue?: string;
};

export type RoleDashboardAttention = {
  label: string;
  value: string | number;
  detail?: string;
  to: string;
};

export type RoleDashboardStep = {
  label: string;
  value: string | number;
  detail?: string;
};

export type RoleDashboardRecord = {
  id: string;
  title: string;
  detail: string;
  status: string;
  amount?: string;
  to: string;
};

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (["approved", "paid", "settled"].some((token) => value.includes(token))) return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (["pending", "submitted", "under_review", "ready", "draft", "contested"].some((token) => value.includes(token))) return "bg-amber-50 text-amber-900 ring-amber-200";
  if (["rejected", "declined", "failed"].some((token) => value.includes(token))) return "bg-rose-50 text-rose-800 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function RoleDashboardOverview({
  title,
  loading,
  error = false,
  onRetry,
  metrics,
  attention,
  steps,
  recentRecords,
}: {
  title: string;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  metrics: RoleDashboardMetric[];
  attention: RoleDashboardAttention[];
  steps: RoleDashboardStep[];
  recentRecords?: {
    title: string;
    viewAllHref: string;
    loading: boolean;
    error: boolean;
    items: RoleDashboardRecord[];
  };
}) {
  return (
    <section className="space-y-3" aria-label={`${title} overview`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {error ? (
          <div className="flex items-center gap-2 text-xs text-amber-800" role="status">
            <span>Some totals or status details are unavailable.</span>
            {onRetry ? (
              <button type="button" onClick={onRetry} className="min-h-11 rounded px-2 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 bg-white px-2.5 py-3 sm:px-4 sm:py-3.5">
            <dt className="text-[10px] leading-tight text-slate-500 sm:text-xs">{metric.label}</dt>
            <dd className="mt-1 truncate text-base font-semibold tabular-nums text-slate-900 sm:text-xl" title={metric.fullValue}>
              {loading ? <span className="inline-block h-5 w-16 animate-pulse rounded bg-slate-200" /> : metric.value}
            </dd>
            {metric.detail ? <div className="mt-0.5 truncate text-[10px] leading-tight text-slate-500 sm:text-xs" title={metric.detail}>{metric.detail}</div> : null}
          </div>
        ))}
      </dl>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white" aria-labelledby="role-dashboard-attention">
          <h3 id="role-dashboard-attention" className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Needs attention</h3>
          {loading ? (
            <div className="space-y-3 px-4 py-4" aria-label="Loading attention items">
              <span className="block h-4 w-full animate-pulse rounded bg-slate-100" />
              <span className="block h-4 w-3/4 animate-pulse rounded bg-slate-100" />
            </div>
          ) : attention.length ? (
            <ul className="divide-y divide-slate-100 px-4">
              {attention.map((item) => (
                <li key={item.label}>
                  <Link to={item.to} className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm text-slate-700 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                    <span className="min-w-0 flex-1">{item.label}</span>
                    <span className="ml-2 flex shrink-0 items-center gap-2 font-semibold tabular-nums text-slate-900">
                      <span className="min-w-0 text-right">
                        <span>{item.value}</span>
                        {item.detail ? <span className="block max-w-[190px] truncate text-xs font-normal text-slate-500" title={item.detail}>{item.detail}</span> : null}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={cn("px-4 py-4 text-sm", error ? "text-amber-800" : "text-slate-500")}>
              {error ? "Attention items could not be checked." : "Nothing needs attention."}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white" aria-labelledby="role-dashboard-workflow">
          <h3 id="role-dashboard-workflow" className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Work in progress</h3>
          <ol className="grid grid-cols-2 gap-x-3 gap-y-0 px-4 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.label} className="min-w-0 py-3">
                <div className="text-xs text-slate-500">{index + 1}. {step.label}</div>
                <div className="mt-1 truncate text-lg font-semibold tabular-nums text-slate-900">
                  {loading ? <span className="inline-block h-5 w-14 animate-pulse rounded bg-slate-200" /> : step.value}
                </div>
                {step.detail ? <div className="truncate text-xs text-slate-500" title={step.detail}>{step.detail}</div> : null}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {recentRecords ? (
        <section className="rounded-xl border border-slate-200 bg-white" aria-label={recentRecords.title}>
          <header className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">{recentRecords.title}</h3>
            <Link to={recentRecords.viewAllHref} className="flex min-h-11 shrink-0 items-center rounded px-2 text-sm font-medium text-slate-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">View all</Link>
          </header>
          {recentRecords.loading ? (
            <div className="space-y-3 px-4 py-4" aria-label={`Loading ${recentRecords.title.toLowerCase()}`}>
              <span className="block h-4 w-full animate-pulse rounded bg-slate-100" />
              <span className="block h-4 w-3/4 animate-pulse rounded bg-slate-100" />
              <span className="block h-4 w-5/6 animate-pulse rounded bg-slate-100" />
            </div>
          ) : recentRecords.error ? (
            <p className="px-4 py-4 text-sm text-amber-800" role="status">Recent records could not be loaded. Retry the dashboard.</p>
          ) : recentRecords.items.length > 0 ? (
            <ul className="divide-y divide-slate-100 px-4">
              {recentRecords.items.map((record) => (
                <li key={record.id}>
                  <Link to={record.to} className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{record.title}</span>
                      <span className="block truncate text-xs text-slate-500">{record.detail}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {record.amount ? <span className="hidden text-xs font-medium tabular-nums text-slate-700 sm:inline">{record.amount}</span> : null}
                      <span className={cn("rounded-full px-2 py-1 text-[11px] font-medium capitalize ring-1 ring-inset", statusTone(record.status))}>{record.status.replace(/_/g, " ")}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 text-sm text-slate-500">No recent records.</p>
          )}
        </section>
      ) : null}
    </section>
  );
}
