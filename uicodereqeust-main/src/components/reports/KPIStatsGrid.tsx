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
        { label: "Total Codes", value: stats.totalCodes.toLocaleString(), icon: BarChart3, color: "text-slate-700", bg: "bg-slate-100" },
        { label: "Approved", value: stats.approvedCodes.toLocaleString(), icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Pending", value: stats.pendingCodes.toLocaleString(), icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
        { label: "Rejected", value: stats.rejectedCodes.toLocaleString(), icon: AlertTriangle, color: "text-rose-600", bg: "bg-rose-50" },
      ],
      [
        { label: "Requested Amount", value: formatNaira(stats.requestedAmount), icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
        { label: "Approved Amount", value: formatNaira(stats.approvedAmount), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Rejected Amount", value: formatNaira(stats.rejectedAmount), icon: DollarSign, color: "text-rose-600", bg: "bg-rose-50" },
        { label: "Pending Amount", value: formatNaira(stats.pendingAmount), icon: DollarSign, color: "text-amber-600", bg: "bg-amber-50" },
      ],
      [
        { label: "Approval Rate", value: formatPercent(stats.approvalRate), icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
        { label: "Rejection Rate", value: formatPercent(stats.rejectionRate), icon: TrendingUp, color: "text-rose-600", bg: "bg-rose-50" },
        { label: "Avg Processing", value: `${stats.avgProcessingTime.toFixed(1)} hrs`, icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
        { label: "Daily Volume", value: `${stats.dailyVolume.toFixed(0)}/day`, icon: Activity, color: "text-violet-600", bg: "bg-violet-50" },
      ],
    ],
    [stats]
  );

  return (
    <div className="space-y-4">
      {kpiGroups.map((group, groupIndex) => (
        <div key={groupIndex} className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-4">
          {group.map((kpi, index) => (
            <Card key={index} className="border-slate-100 shadow-none bg-white rounded-xl overflow-hidden">
              <CardContent className="p-2 sm:p-3 md:p-4 flex items-center gap-1.5 sm:gap-3">
                <div className={cn("hidden sm:flex h-8 w-8 md:h-10 md:w-10 rounded-md sm:rounded-xl items-center justify-center shrink-0", kpi.bg)}>
                  <kpi.icon className={cn("h-4 w-4 md:h-5 md:w-5", kpi.color)} />
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-xs sm:text-xs md:text-xs font-bold uppercase tracking-wider text-slate-400 truncate leading-none">{kpi.label}</p>
                  <p className={cn("text-xs sm:text-sm md:text-base lg:text-lg font-black tracking-tight truncate leading-none mt-1 sm:mt-1.5", kpi.color)}>
                    {isLoading ? <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin mx-auto sm:mx-0" /> : kpi.value}
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
