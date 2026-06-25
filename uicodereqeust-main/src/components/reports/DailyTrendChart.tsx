import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendPoint } from "@/lib/reports-helpers";

interface DailyTrendChartProps {
  data: TrendPoint[];
}

export default function DailyTrendChart({ data }: DailyTrendChartProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-4">Daily Approval Trend</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="approved" stroke="#10B981" strokeWidth={2} name="Approved" />
          <Line type="monotone" dataKey="rejected" stroke="#EF4444" strokeWidth={2} name="Rejected" />
          <Line type="monotone" dataKey="pending" stroke="#F59E0B" strokeWidth={2} name="Pending" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
