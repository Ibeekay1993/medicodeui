import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { ReportStats } from "@/lib/reports-helpers";

interface StatusDistributionChartProps {
  stats: ReportStats;
}

export default function StatusDistributionChart({ stats }: StatusDistributionChartProps) {
  const data = useMemo(
    () => [
      { name: "Approved", value: stats.approvedCodes, color: "#15803D" },
      { name: "Pending", value: stats.pendingCodes, color: "#B45309" },
      { name: "Rejected", value: stats.rejectedCodes, color: "#B91C1C" },
    ],
    [stats]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="mb-1 text-sm font-semibold text-slate-900">Request status</h3>
      <p className="mb-4 text-xs text-slate-500">Approved, pending, and rejected requests</p>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => value.toLocaleString()} contentStyle={{ borderRadius: 8, borderColor: "#CBD5E1", fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#475569" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
