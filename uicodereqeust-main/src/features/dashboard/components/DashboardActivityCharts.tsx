// src/features/dashboard/components/DashboardActivityCharts.tsx
// Renders dual Activity charts for Admin (Authorization + Claims)
// and contextual single Activity chart for Staff (Finance / Claims / Clinical).

import { Card } from "@/components/ui/card";
import { Banknote, ShieldCheck, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ActivityRow, ChartErrors } from "../hooks/useDashboardHomeMetrics";

interface DashboardActivityChartsProps {
  role: string | null | undefined;
  loading: boolean;
  chartData: ActivityRow[];
  claimChartData: ActivityRow[];
  chartErrors: ChartErrors;
  staffChartError: boolean;
  onRetry: () => void;
  money: (value: number) => string;
}

export function DashboardActivityCharts({
  role,
  loading,
  chartData,
  claimChartData,
  chartErrors,
  staffChartError,
  onRetry,
  money,
}: DashboardActivityChartsProps) {
  const isAdmin = role === "admin";
  const isClaims = role === "claims" || role === "claims_lead";
  const isFinance = role === "finance";
  const isUtilizationManager = role === "utilization_manager" || role === "utilization_manager_lead";

  if (isAdmin) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Auth Chart */}
        <Card className="med-card overflow-hidden p-6 flex flex-col">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                Authorization Activity
              </h3>
              <p className="mt-1 text-xs text-slate-500">Requests by issue date · last 7 days</p>
            </div>
          </div>

          <div className="h-[260px] w-full mt-auto">
            {loading ? (
              <div className="w-full h-full animate-pulse bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center">
                <span className="text-sm font-medium text-slate-400">Loading chart data...</span>
              </div>
            ) : chartErrors.authorization ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-center">
                <span className="text-sm text-amber-900">Authorization activity could not be loaded.</span>
                <button
                  type="button"
                  onClick={onRetry}
                  className="min-h-11 px-3 text-sm font-semibold text-amber-950 underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            ) : chartData.length === 0 ? (
              <div className="w-full h-full bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center">
                <span className="text-sm font-medium text-slate-400">No authorization data available</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="authGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.16} />
                      <stop offset="95%" stopColor="#1D9E75" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="dateStr"
                    type="category"
                    scale="point"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fontWeight: 500, fill: "#64748B" }}
                    tickFormatter={(v: string) => chartData.find((d) => d.dateStr === v)?.tickLabel ?? v}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fontWeight: 500, fill: "#64748B" }}
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    labelFormatter={(label) => chartData.find((item) => item.dateStr === String(label))?.name ?? ""}
                    formatter={(value: number, name: string) => [
                      value.toLocaleString(),
                      name === "volume" ? "Total Requests" : "Approved",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 10px 30px rgb(15 23 42 / 0.08)",
                      fontSize: "12px",
                      padding: "8px 12px",
                    }}
                  />
                  <Area type="monotone" dataKey="volume" stroke="#CBD5E1" fill="transparent" strokeWidth={2} name="volume" />
                  <Area
                    type="monotone"
                    dataKey="approved"
                    stroke="#1D9E75"
                    fillOpacity={1}
                    fill="url(#authGradient)"
                    strokeWidth={2.5}
                    name="approved"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Claims Chart */}
        <Card className="med-card overflow-hidden p-6 flex flex-col">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Banknote className="h-4 w-4 text-amber-700" strokeWidth={2} />
                Claims Activity
              </h3>
              <p className="mt-1 text-xs text-slate-500">Claims by submission date · last 7 days</p>
            </div>
          </div>

          <div className="h-[260px] w-full mt-auto">
            {loading ? (
              <div className="w-full h-full animate-pulse bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center">
                <span className="text-sm font-medium text-slate-400">Loading chart data...</span>
              </div>
            ) : chartErrors.claims ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-center">
                <span className="text-sm text-amber-900">Claims activity could not be loaded.</span>
                <button
                  type="button"
                  onClick={onRetry}
                  className="min-h-11 px-3 text-sm font-semibold text-amber-950 underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            ) : claimChartData.length === 0 ? (
              <div className="w-full h-full bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center">
                <span className="text-sm font-medium text-slate-400">No claims data available</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={claimChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="claimGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#BA7517" stopOpacity={0.16} />
                      <stop offset="95%" stopColor="#BA7517" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="dateStr"
                    type="category"
                    scale="point"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fontWeight: 500, fill: "#64748B" }}
                    tickFormatter={(v: string) => claimChartData.find((d) => d.dateStr === v)?.tickLabel ?? v}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fontWeight: 500, fill: "#64748B" }}
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    labelFormatter={(label) => claimChartData.find((item) => item.dateStr === String(label))?.name ?? ""}
                    formatter={(value: number, name: string) => [
                      value.toLocaleString(),
                      name === "volume" ? "Total Claims" : "Approved",
                    ]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 10px 30px rgb(15 23 42 / 0.08)",
                      fontSize: "12px",
                      padding: "8px 12px",
                    }}
                  />
                  <Area type="monotone" dataKey="volume" stroke="#CBD5E1" fill="transparent" strokeWidth={2} name="volume" />
                  <Area
                    type="monotone"
                    dataKey="approved"
                    stroke="#BA7517"
                    fillOpacity={1}
                    fill="url(#claimGradient)"
                    strokeWidth={2.5}
                    name="approved"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // Staff single chart
  return (
    <Card className="med-card overflow-hidden p-6">
      <div className="mb-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {role === "finance" ? (
            <>
              <Banknote className="h-4 w-4 text-amber-700" strokeWidth={1.5} />
              Payment Activity
            </>
          ) : isClaims ? (
            <>
              <Banknote className="h-4 w-4 text-amber-700" strokeWidth={1.5} />
              Claims Activity
            </>
          ) : (
            <>
              <TrendingUp className="h-4 w-4 text-slate-600" strokeWidth={1.5} />
              {isUtilizationManager ? "Authorization activity" : "Request activity"}
            </>
          )}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {role === "finance"
            ? "Payment activity · last 7 days"
            : isClaims
            ? "Claims activity · last 7 days"
            : isUtilizationManager
            ? "Requests by issue date · last 7 days"
            : "Requests by issue date · last 7 days"}
        </p>
      </div>
      <div className="h-[300px] w-full">
        {loading ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-sm text-slate-500">
            Loading activity…
          </div>
        ) : staffChartError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-center">
            <span className="text-sm text-amber-900">Activity could not be loaded.</span>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 px-3 text-sm font-semibold text-amber-950 underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-sm text-slate-500">
            No activity in the last 7 days.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isClaims || isFinance ? "#BA7517" : "#1D9E75"} stopOpacity={0.16} />
                  <stop offset="95%" stopColor={isClaims || isFinance ? "#BA7517" : "#1D9E75"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis
                dataKey="dateStr"
                type="category"
                scale="point"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 500, fill: "#64748B" }}
                tickFormatter={(dateStr: string) => chartData.find((d) => d.dateStr === dateStr)?.tickLabel ?? dateStr}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 500, fill: "#64748B" }}
                allowDecimals={false}
              />
              <RechartsTooltip
                labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 10px 30px rgb(15 23 42 / 0.08)",
                  fontSize: "12px",
                }}
                formatter={(value: any, name: string) => {
                  const formattedName =
                    name === "volume"
                      ? isFinance
                        ? "Paid claims"
                        : isUtilizationManager
                        ? "Requests"
                        : "Submitted volume"
                      : name === "approved"
                      ? isFinance
                        ? "Paid value"
                        : isUtilizationManager
                        ? "Approved"
                        : "Approved volume"
                      : name;
                  const formattedValue =
                    isFinance && name === "approved"
                      ? money(Number(value))
                      : typeof value === "number"
                      ? value.toLocaleString()
                      : value;
                  return [formattedValue, formattedName];
                }}
              />
              <Area type="monotone" dataKey="volume" stroke="#CBD5E1" fill="transparent" strokeWidth={2} />
              <Area
                type="monotone"
                dataKey="approved"
                stroke={isClaims || isFinance ? "#BA7517" : "#1D9E75"}
                fillOpacity={1}
                fill="url(#colorVolume)"
                strokeWidth={3}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
