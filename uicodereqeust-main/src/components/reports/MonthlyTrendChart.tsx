import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendPoint, formatNaira } from "@/lib/reports-helpers";

interface MonthlyTrendChartProps {
  data: TrendPoint[];
}

export default function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="mb-1 text-sm font-semibold text-slate-900">Approved value by month</h3>
      <p className="mb-4 text-xs text-slate-500">Approved claim amounts for the selected period</p>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748B" }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748B" }} />
          <Tooltip formatter={(value: number) => formatNaira(value)} contentStyle={{ borderRadius: 8, borderColor: "#CBD5E1", fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#475569" }} />
          <Bar dataKey="approvedAmount" fill="#2563EB" name="Approved amount" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
