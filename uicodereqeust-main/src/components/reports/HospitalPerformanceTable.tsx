import { cn } from "@/lib/utils";
import { HospitalPerformance, formatNaira } from "@/lib/reports-helpers";
import { Building2, Award } from "lucide-react";

interface HospitalPerformanceTableProps {
  data: HospitalPerformance[];
}

export default function HospitalPerformanceTable({ data }: HospitalPerformanceTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-col gap-1 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Provider Performance & Volume</h3>
          <p className="mt-0.5 text-xs text-slate-500">Request throughput, approval velocity, and approved financial totals by healthcare facility</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {data.length} {data.length === 1 ? "Provider" : "Providers"}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80">
            <tr>
              <th className="w-12 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:px-4">#</th>
              <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:px-5">Hospital Facility</th>
              <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:px-5">Total</th>
              <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-emerald-700 sm:px-4">Approved</th>
              <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-amber-700 sm:px-4">Pending</th>
              <th className="px-3 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-rose-700 sm:px-4">Rejected</th>
              <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-700 sm:px-5">Approved Value</th>
              <th className="w-44 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:px-5">Approval Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((hosp, index) => {
              const rate = Math.min(100, Math.max(0, hosp.approvalRate || 0));
              const isTop = index === 0 && hosp.totalCodes > 0;

              return (
                <tr key={index} className="transition-colors hover:bg-slate-50/70">
                  <td className="px-3 py-3.5 text-center sm:px-4">
                    {isTop ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                        <Award className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-xs font-semibold tabular-nums text-slate-400">
                        {index + 1}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 sm:px-5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <span className="font-semibold leading-tight text-slate-800 break-words [overflow-wrap:anywhere]">
                        {hosp.hospital}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium tabular-nums text-slate-900 sm:px-5">
                    {hosp.totalCodes.toLocaleString()}
                  </td>
                  <td className="px-3 py-3.5 text-right sm:px-4">
                    <span className="inline-block rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold tabular-nums text-emerald-800">
                      {hosp.approvedCodes.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-right sm:px-4">
                    <span className="inline-block rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-800">
                      {hosp.pendingCodes.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-right sm:px-4">
                    <span className="inline-block rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-bold tabular-nums text-rose-800">
                      {hosp.rejectedCodes.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold tabular-nums text-slate-900 sm:px-5">
                    {formatNaira(hosp.approvedAmount)}
                  </td>
                  <td className="px-4 py-3.5 sm:px-5">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className={cn(
                            "font-bold tabular-nums",
                            rate >= 80 ? "text-emerald-700" : rate >= 50 ? "text-amber-700" : "text-rose-700"
                          )}
                        >
                          {rate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-300",
                            rate >= 80 ? "bg-emerald-600" : rate >= 50 ? "bg-amber-500" : "bg-rose-500"
                          )}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-xs font-semibold text-slate-400">
                  No hospital performance records found for this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
