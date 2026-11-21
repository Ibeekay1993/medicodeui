import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendPoint, formatNaira } from "@/lib/reports-helpers";
import { TrendingUp } from "lucide-react";

interface MonthlyTrendChartProps {
  data: TrendPoint[];
}

function formatCompactNaira(val: number): string {
  if (val >= 1_000_000_000) return `₦${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `₦${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `₦${(val / 1_000).toFixed(0)}K`;
  return `₦${val}`;
}

export default function MonthlyTrendChart({ data }: MonthlyTrendChartProps) {
  const totalApproved = data.reduce((acc, curr) => acc + (curr.approvedAmount || 0), 0);

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Approved Value Trend</h3>
            <p className="mt-0.5 text-xs text-slate-500">Net authorized claims over the selected period</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 sm:inline-block">
              {formatCompactNaira(totalApproved)} total
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
        </div>

        {data.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <p className="text-xs font-semibold text-slate-400">No trend data available for this range</p>
          </div>
        ) : (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#1D4ED8" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#F1F5F9" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  dy={4}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  tickFormatter={formatCompactNaira}
                />
                <Tooltip
                  formatter={(value: number) => [formatNaira(value), "Approved Amount"]}
                  contentStyle={{
                    borderRadius: "10px",
                    borderColor: "#E2E8F0",
                    fontSize: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                  }}
                  cursor={{ fill: "#F8FAFC" }}
                />
                <Bar
                  dataKey="approvedAmount"
                  fill="url(#barGradient)"
                  name="Approved amount"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-600" />
          Values based on final authorization decisions
        </span>
        <span className="font-medium text-slate-700">{data.length} periods active</span>
      </div>
    </div>
  );
}
