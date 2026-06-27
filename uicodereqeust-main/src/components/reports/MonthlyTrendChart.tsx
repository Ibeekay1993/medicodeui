import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendPoint, formatNaira } from "@/lib/reports-helpers";

interface MonthlyTrendChartProps {
  data: TrendPoint[];
}

export default function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  return (
    <div className="premium-card bg-white rounded-2xl border border-slate-100 p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
      <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-4">Monthly Financial Trend</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value: number) => formatNaira(value)} />
          <Legend />
          <Bar dataKey="approvedAmount" fill="#10B981" name="Approved Amount" radius={[4, 4, 0, 0]} />
          <Bar dataKey="rejectedAmount" fill="#EF4444" name="Rejected Amount" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
