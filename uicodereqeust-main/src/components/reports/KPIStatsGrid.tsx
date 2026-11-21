import { BarChart3, CheckCircle2, Clock, DollarSign, TrendingUp, Activity, AlertTriangle, ShieldCheck } from "lucide-react";
import { ReportStats, formatNaira, formatPercent } from "@/lib/reports-helpers";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPIStatsGridProps {
  stats: ReportStats;
  isLoading: boolean;
}

const MetricSkeleton = () => (
  <span className="inline-block h-6 w-24 animate-pulse rounded bg-slate-200/80" aria-label="Loading" />
);

export default function KPIStatsGrid({ stats, isLoading }: KPIStatsGridProps) {
  const total = stats.totalCodes || 1;
  const approvedPct = ((stats.approvedCodes / total) * 100).toFixed(1);
  const pendingPct = ((stats.pendingCodes / total) * 100).toFixed(1);
  const rejectedPct = ((stats.rejectedCodes / total) * 100).toFixed(1);

  return (
    <div className="space-y-3.5">
      {/* Top Tier: Hero Financial Metric + 3 Status Buckets */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        
        {/* Hero Card: Net Approved Value */}
        <Card className="relative overflow-hidden rounded-xl border border-blue-900/10 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 p-4 text-white shadow-md sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-200">
              Net Approved Value
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-emerald-400 backdrop-blur-xs">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <div className="font-mono text-xl font-bold tracking-tight text-white sm:text-2xl tabular-nums">
              {isLoading ? <span className="inline-block h-7 w-32 animate-pulse rounded bg-white/20" /> : formatNaira(stats.approvedAmount)}
            </div>
            <p className="mt-1 text-[11px] text-slate-300">
              Total authorized claim liability
            </p>
          </div>
          <div className="absolute -bottom-6 -right-6 h-20 w-20 rounded-full bg-blue-500/10 blur-xl pointer-events-none" />
        </Card>

        {/* Approved Card */}
        <Card className="flex flex-col justify-between rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-3.5 shadow-xs transition-colors hover:border-emerald-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Approved
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
              {approvedPct}%
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="font-mono text-xl font-bold text-emerald-950 tabular-nums">
              {isLoading ? <MetricSkeleton /> : stats.approvedCodes.toLocaleString()}
            </div>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Authorized treatments
          </div>
        </Card>

        {/* Pending Card */}
        <Card className="flex flex-col justify-between rounded-xl border border-amber-200/80 bg-amber-50/30 p-3.5 shadow-xs transition-colors hover:border-amber-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Pending Review
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
              {pendingPct}%
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="font-mono text-xl font-bold text-amber-950 tabular-nums">
              {isLoading ? <MetricSkeleton /> : stats.pendingCodes.toLocaleString()}
            </div>
            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Awaiting clinical decision
          </div>
        </Card>

        {/* Rejected Card */}
        <Card className="flex flex-col justify-between rounded-xl border border-rose-200/80 bg-rose-50/30 p-3.5 shadow-xs transition-colors hover:border-rose-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
              Declined
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
              {rejectedPct}%
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="font-mono text-xl font-bold text-rose-950 tabular-nums">
              {isLoading ? <MetricSkeleton /> : stats.rejectedCodes.toLocaleString()}
            </div>
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Ineligible or unapproved
          </div>
        </Card>
      </div>

      {/* Bottom Tier: Operational Throughput & SLA Metrics */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        
        {/* Total Volume */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
              Total Volume
            </span>
            <BarChart3 className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1.5 font-mono text-base font-bold text-slate-900 tabular-nums">
            {isLoading ? <MetricSkeleton /> : stats.totalCodes.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400">All intake channels</div>
        </div>

        {/* Approval Rate */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
              Approval Rate
            </span>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div className="mt-1.5 font-mono text-base font-bold text-slate-900 tabular-nums">
            {isLoading ? <MetricSkeleton /> : formatPercent(stats.approvalRate)}
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                stats.approvalRate > 80 ? "bg-emerald-600" : stats.approvalRate > 60 ? "bg-amber-500" : "bg-rose-500"
              )}
              style={{ width: `${Math.min(100, Math.max(0, stats.approvalRate))}%` }}
            />
          </div>
        </div>

        {/* Avg Processing Time */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
              Decision Speed
            </span>
            <Clock className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1.5 font-mono text-base font-bold text-slate-900 tabular-nums">
            {isLoading ? <MetricSkeleton /> : `${stats.avgProcessingTime.toFixed(1)} hrs`}
          </div>
          <div className="text-[10px] text-slate-400">Avg turnaround SLA</div>
        </div>

        {/* Daily Throughput */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
              Daily Volume
            </span>
            <Activity className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1.5 font-mono text-base font-bold text-slate-900 tabular-nums">
            {isLoading ? <MetricSkeleton /> : `${stats.dailyVolume.toFixed(0)} / day`}
          </div>
          <div className="text-[10px] text-slate-400">Intake velocity</div>
        </div>

      </div>
    </div>
  );
}
