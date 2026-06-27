import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { ReportStats } from "@/lib/reports-helpers";

interface StatusDistributionChartProps {
  stats: ReportStats;
}

export default function StatusDistributionChart({ stats }: StatusDistributionChartProps) {
  const data = useMemo(
    () => [
      { name: "Approved", value: stats.approvedCodes, color: "#10B981" },
      { name: "Pending", value: stats.pendingCodes, color: "#F59E0B" },
      { name: "Rejected", value: stats.rejectedCodes, color: "#EF4444" },
    ],
    [stats]
  );

  return (
    <div className="premium-card bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
      <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-4">Status Distribution</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => value.toLocaleString()} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
