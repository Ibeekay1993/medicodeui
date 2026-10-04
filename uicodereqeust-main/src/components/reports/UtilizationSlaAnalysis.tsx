import { useMemo } from "react";
import { AlarmClock, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import type { PreAuthRecord } from "@/lib/reports-helpers";

interface UtilizationSlaAnalysisProps {
  records: PreAuthRecord[];
  managerNames: Record<string, string>;
  viewerId?: string;
  canSeeTeamPerformance: boolean;
}

const ON_TIME_MINUTES = 15;
const WARNING_MINUTES = 30;
const PENDING_STATUSES = new Set(["pending", "pending_referral", "pending_authorization", "info_provided"]);

function responseMinutes(record: PreAuthRecord, now: number): number | null {
  const start = Date.parse(record.treatment_submitted_at || record.created_at);
  const end = record.decided_at ? Date.parse(record.decided_at) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60_000);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export default function UtilizationSlaAnalysis({ records, managerNames, viewerId, canSeeTeamPerformance }: UtilizationSlaAnalysisProps) {
  const analysis = useMemo(() => {
    const now = Date.now();
    const eligible = records.filter((record) => !record.is_historical);
    const measured = eligible.flatMap((record) => {
      const minutes = responseMinutes(record, now);
      return minutes === null ? [] : [{ record, minutes }];
    });
    const completed = measured.filter(({ record }) => Boolean(record.decided_at));
    const pending = measured.filter(({ record }) => !record.decided_at && PENDING_STATUSES.has(String(record.status).toLowerCase()));
    const onTime = completed.filter(({ minutes }) => minutes <= ON_TIME_MINUTES);
    const warning = completed.filter(({ minutes }) => minutes > ON_TIME_MINUTES && minutes <= WARNING_MINUTES);
    const breached = completed.filter(({ minutes }) => minutes > WARNING_MINUTES);
    const pendingWarning = pending.filter(({ minutes }) => minutes > ON_TIME_MINUTES && minutes <= WARNING_MINUTES);
    const pendingBreached = pending.filter(({ minutes }) => minutes > WARNING_MINUTES);

    const managers = new Map<string, { label: string; durations: number[]; onTime: number; overTarget: number; breached: number }>();
    completed.forEach(({ record, minutes }) => {
      const managerId = record.approved_by || record.decided_by;
      if (!managerId) return;
      const label = managerNames[managerId] || record.clinician || `Manager ${managerId.slice(0, 8)}`;
      const row = managers.get(managerId) || { label, durations: [], onTime: 0, overTarget: 0, breached: 0 };
      row.durations.push(minutes);
      if (minutes <= ON_TIME_MINUTES) row.onTime++;
      if (minutes > ON_TIME_MINUTES) row.overTarget++;
      if (minutes > WARNING_MINUTES) row.breached++;
      managers.set(managerId, row);
    });

    return {
      completed,
      onTime,
      warning,
      breached,
      pendingWarning,
      pendingBreached,
      medianMinutes: median(completed.map(({ minutes }) => minutes)),
      managerRows: [...managers.entries()]
        .map(([id, row]) => ({ id, ...row, count: row.durations.length, medianMinutes: median(row.durations) }))
        .filter((row) => canSeeTeamPerformance || row.id === viewerId)
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    };
  }, [records, managerNames, viewerId, canSeeTeamPerformance]);

  const completionRate = analysis.completed.length
    ? Math.round((analysis.onTime.length / analysis.completed.length) * 100)
    : 0;

  const metrics = [
    { label: "Reviewed within 15 min", value: `${completionRate}%`, detail: `${analysis.onTime.length} of ${analysis.completed.length} decided requests`, icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50" },
    { label: "Median review time", value: formatDuration(analysis.medianMinutes), detail: "From treatment submitted to decision", icon: Clock3, color: "text-indigo-700", bg: "bg-indigo-50" },
    { label: "At risk · 16–30 min", value: String(analysis.warning.length + analysis.pendingWarning.length), detail: `${analysis.pendingWarning.length} still pending`, icon: AlarmClock, color: "text-amber-700", bg: "bg-amber-50" },
    { label: "Over SLA · over 30 min", value: String(analysis.breached.length + analysis.pendingBreached.length), detail: `${analysis.pendingBreached.length} still pending`, icon: ShieldAlert, color: "text-rose-700", bg: "bg-rose-50" },
  ];

  return (
    <section aria-labelledby="utilization-sla-title" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h3 id="utilization-sla-title" className="text-base font-bold text-slate-900">Utilization Manager SLA Analysis</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Matches the Authorization Queue: on time up to 15 minutes, at risk from 16–30 minutes, and over SLA after 30 minutes. Time starts at treatment submission, or request creation when that timestamp is unavailable. Historical imports are excluded.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">SLA figures use the filtered request set shown above.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon, color, bg }) => (
          <div key={label} className="min-w-0 rounded-xl border border-slate-100 p-3.5">
            <div className="flex items-start gap-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg} ${color}`}><Icon className="h-4 w-4" /></span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium leading-snug text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">{detail}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="border-b border-slate-100 bg-slate-50 px-3.5 py-2.5">
          <h4 className="text-sm font-semibold text-slate-800">{canSeeTeamPerformance ? "Decisions by Utilization Manager" : "Your Decisions"}</h4>
        </div>
        {analysis.managerRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3.5 py-2.5">Manager</th>
                  <th className="px-3.5 py-2.5 text-right">Decisions</th>
                  <th className="px-3.5 py-2.5 text-right">Within 15 min</th>
                  <th className="px-3.5 py-2.5 text-right">Median time</th>
                  <th className="px-3.5 py-2.5 text-right">Over 30 min</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analysis.managerRows.map((row) => (
                  <tr key={row.id} className="text-slate-700">
                    <td className="max-w-[220px] truncate px-3.5 py-3 font-medium" title={row.label}>{row.label}</td>
                    <td className="px-3.5 py-3 text-right tabular-nums">{row.count}</td>
                    <td className="px-3.5 py-3 text-right tabular-nums">{Math.round((row.onTime / row.count) * 100)}%</td>
                    <td className="px-3.5 py-3 text-right tabular-nums">{formatDuration(row.medianMinutes)}</td>
                    <td className="px-3.5 py-3 text-right tabular-nums">{row.breached}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-3.5 py-6 text-center text-xs text-slate-500">No non-historical decisions in this report period.</p>
        )}
      </div>
    </section>
  );
}
