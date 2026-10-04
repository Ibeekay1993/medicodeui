import { cn } from "@/lib/utils";
import { HospitalPerformance, formatNaira } from "@/lib/reports-helpers";
import { Building2 } from "lucide-react";

interface HospitalPerformanceTableProps {
  data: HospitalPerformance[];
}

export default function HospitalPerformanceTable({ data }: HospitalPerformanceTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-slate-900">Hospital performance</h3>
        <p className="mt-1 text-xs text-slate-500">Request and approved amount totals by provider</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 sm:px-5">Hospital</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 sm:px-5">Total requests</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 sm:px-5">Approved</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 sm:px-5">Pending</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 sm:px-5">Rejected</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 sm:px-5">Approved value</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 sm:px-5">Approval rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((hosp, index) => (
              <tr key={index} className="transition-colors hover:bg-slate-50">
                <td className="px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <span className="font-medium leading-tight text-slate-800">{hosp.hospital}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 sm:px-5">{hosp.totalCodes}</td>
                <td className="px-4 py-3 text-right sm:px-5">
                  <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-emerald-700">
                    {hosp.approvedCodes}
                  </span>
                </td>
                <td className="px-4 py-3 text-right sm:px-5">
                  <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-amber-700">
                    {hosp.pendingCodes}
                  </span>
                </td>
                <td className="px-4 py-3 text-right sm:px-5">
                  <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-rose-700">
                    {hosp.rejectedCodes}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-800 sm:px-5">{formatNaira(hosp.approvedAmount)}</td>
                <td className="px-4 py-3 text-right sm:px-5">
                  <span
                    className={cn(
                      "rounded border px-2 py-1 text-xs font-medium tabular-nums",
                      hosp.approvalRate > 85
                        ? "bg-slate-50 text-emerald-700 border-slate-200"
                        : hosp.approvalRate > 60
                        ? "bg-slate-50 text-amber-700 border-slate-200"
                        : "bg-slate-50 text-rose-700 border-slate-200"
                    )}
                  >
                    {hosp.approvalRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs font-semibold text-slate-400">
                  No hospital performance data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
