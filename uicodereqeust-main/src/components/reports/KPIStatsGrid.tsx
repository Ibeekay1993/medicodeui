import { useMemo } from "react";
import {
  Activity,
  TrendingUp,
  Clock,
  Loader2,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  BarChart3,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ReportStats, formatNaira, formatPercent } from "@/lib/reports-helpers";

interface KPIStatsGridProps {
  stats: ReportStats;
  isLoading: boolean;
}

export default function KPIStatsGrid({ stats, isLoading }: KPIStatsGridProps) {
  const kpiGroups = useMemo(
    () => [
      [
        { label: "Total Codes", value: stats.totalCodes.toLocaleString(), icon: BarChart3, color: "text-slate-700", bg: "bg-slate-50", gradient: "group-hover:bg-slate-100" },
        { label: "Approved", value: stats.approvedCodes.toLocaleString(), icon: CheckCircle, color: "text-emerald-600", bg: "bg-slate-50", gradient: "group-hover:bg-slate-100" },
        { label: "Pending", value: stats.pendingCodes.toLocaleString(), icon: Clock, color: "text-amber-600", bg: "bg-slate-50", gradient: "group-hover:bg-slate-100" },
        { label: "Rejected", value: stats.rejectedCodes.toLocaleString(), icon: AlertTriangle, color: "text-rose-600", bg: "bg-slate-50", gradient: "group-hover:bg-slate-100" },
      ],
      [
        { label: "Requested Amount", value: formatNaira(stats.requestedAmount), icon: DollarSign, color: "text-blue-600", bg: "bg-slate-50", gradient: "group-hover:bg-slate-100" },
        { label: "Approved Amount", value: formatNaira(stats.approvedAmount), icon: DollarSign, color: "text-emerald-600", bg: "bg-slate-50", gradient: "group-hover:bg-slate-100" },
        { label: "Rejected Amount", value: formatNaira(stats.rejectedAmount), icon: DollarSign, color: "text-rose-600", bg: "bg-slate-50", gradient: "group-hover:bg-slate-100" },
        { label: "Pending Amount", value: formatNaira(stats.pendingAmount), icon: DollarSign, color: "text-amber-600", bg: "bg-slate-50", gradient: "group-hover:bg-slate-100" },
      ],
      [
        { label: "Approval Rate", value: formatPercent(stats.approvalRate), icon: TrendingUp, color: "text-emerald-600", bg: "bg-slate-50", gradient: "group-hover:bg-slate-100" },
        { label: "Rejection Rate", value: formatPercent(stats.rejectionRate), icon: TrendingUp, color: "text-rose-600", bg: "bg-slate-50", gradient: "group-hover:bg-slate-100" },
        { label: "Avg Processing", value: `${stats.avgProcessingTime.toFixed(1)} hrs`, icon: Clock, color: "text-indigo-600", bg: "bg-slate-50", gradient: "group-hover:bg-slate-100" },
        { label: "Daily Volume", value: `${stats.dailyVolume.toFixed(0)}/day`, icon: Activity, color: "text-violet-600", bg: "bg-slate-50", gradient: "group-hover:bg-slate-100" },
      ],
    ],
    [stats]
  );

  return (
    <div className="space-y-4">
      {kpiGroups.map((group, groupIndex) => (
        <div key={groupIndex} className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          {group.map((kpi, index) => (
            <Card key={index} className="border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-1 group">
              <CardContent className="p-3 sm:p-4 md:p-5 flex items-center gap-3">
                <div className={cn("hidden sm:flex h-10 w-10 md:h-12 md:w-12 rounded-xl items-center justify-center shrink-0 transition-colors duration-300", kpi.bg, kpi.gradient)}>
                  <kpi.icon className={cn("h-5 w-5 md:h-6 md:w-6 transition-transform duration-300 group-hover:scale-110", kpi.color)} />
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 truncate leading-tight group-hover:text-slate-500 transition-colors">{kpi.label}</p>
                  <p className={cn("text-sm sm:text-base md:text-lg lg:text-xl font-black tracking-tight truncate leading-none mt-1.5", kpi.color)}>
                    {isLoading ? <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin mx-auto sm:mx-0" /> : kpi.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
