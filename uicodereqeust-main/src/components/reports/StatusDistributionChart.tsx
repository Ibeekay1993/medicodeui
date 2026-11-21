import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ReportStats } from "@/lib/reports-helpers";
import { PieChart as PieIcon } from "lucide-react";

interface StatusDistributionChartProps {
  stats: ReportStats;
}

export default function StatusDistributionChart({ stats }: StatusDistributionChartProps) {
  const total = stats.totalCodes || 0;

  const data = useMemo(() => {
    if (total === 0) return [];
    return [
      { name: "Approved", value: stats.approvedCodes, color: "#059669" },
      { name: "Pending", value: stats.pendingCodes, color: "#D97706" },
      { name: "Rejected", value: stats.rejectedCodes, color: "#E11D48" },
    ].filter((item) => item.value > 0);
  }, [stats, total]);

  const approvedPct = total > 0 ? ((stats.approvedCodes / total) * 100).toFixed(1) : "0.0";
  const pendingPct = total > 0 ? ((stats.pendingCodes / total) * 100).toFixed(1) : "0.0";
  const rejectedPct = total > 0 ? ((stats.rejectedCodes / total) * 100).toFixed(1) : "0.0";

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Request Distribution</h3>
            <p className="mt-0.5 text-xs text-slate-500">Volume breakdown by decision status</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
            <PieIcon className="h-4 w-4" />
          </div>
        </div>

        {total === 0 ? (
          <div className="flex h-52 flex-col items-center justify-center text-center">
            <p className="text-xs font-semibold text-slate-400">No requests recorded in this date range</p>
          </div>
        ) : (
          <div className="relative mt-2">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={2}
                    stroke="#ffffff"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      `${value.toLocaleString()} (${((value / total) * 100).toFixed(1)}%)`,
                      name,
                    ]}
                    contentStyle={{
                      borderRadius: "10px",
                      borderColor: "#E2E8F0",
                      fontSize: "12px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Center label inside donut */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Total</span>
              <span className="text-lg font-bold tracking-tight text-slate-900">{total.toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Legend chips */}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            <span className="text-[11px] font-semibold text-emerald-800">Approved</span>
          </div>
          <p className="mt-1 text-sm font-bold text-slate-900">{stats.approvedCodes.toLocaleString()}</p>
          <span className="text-[10px] font-medium text-emerald-600">{approvedPct}%</span>
        </div>

        <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-2 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-600" />
            <span className="text-[11px] font-semibold text-amber-800">Pending</span>
          </div>
          <p className="mt-1 text-sm font-bold text-slate-900">{stats.pendingCodes.toLocaleString()}</p>
          <span className="text-[10px] font-medium text-amber-600">{pendingPct}%</span>
        </div>

        <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-2 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-600" />
            <span className="text-[11px] font-semibold text-rose-800">Rejected</span>
          </div>
          <p className="mt-1 text-sm font-bold text-slate-900">{stats.rejectedCodes.toLocaleString()}</p>
          <span className="text-[10px] font-medium text-rose-600">{rejectedPct}%</span>
        </div>
      </div>
    </div>
  );
}
