import { BarChart3, CheckCircle, Clock, DollarSign, TrendingUp, Activity, AlertTriangle } from "lucide-react";
import { DashboardMetricGrid } from "@/components/dashboard/DashboardMetricGrid";
import { ReportStats, formatNaira, formatPercent } from "@/lib/reports-helpers";

interface KPIStatsGridProps {
  stats: ReportStats;
  isLoading: boolean;
}

export default function KPIStatsGrid({ stats, isLoading }: KPIStatsGridProps) {
  return (
    <div className="space-y-3">
      <DashboardMetricGrid loading={isLoading} items={[
        { label: "Total requests", value: stats.totalCodes, icon: BarChart3 },
        { label: "Approved", value: stats.approvedCodes, icon: CheckCircle, color: "text-emerald-700" },
        { label: "Pending", value: stats.pendingCodes, icon: Clock, color: "text-amber-700" },
        { label: "Rejected", value: stats.rejectedCodes, icon: AlertTriangle, color: "text-rose-700" },
      ]} />
      <DashboardMetricGrid loading={isLoading} items={[
        { label: "Approved value", value: formatNaira(stats.approvedAmount), icon: DollarSign },
        { label: "Approval rate", value: formatPercent(stats.approvalRate), icon: TrendingUp },
        { label: "Average processing", value: `${stats.avgProcessingTime.toFixed(1)} hrs`, icon: Clock },
        { label: "Daily volume", value: `${stats.dailyVolume.toFixed(0)} / day`, icon: Activity },
      ]} />
    </div>
  );
}
