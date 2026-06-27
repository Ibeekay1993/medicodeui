import { cn } from "@/lib/utils";
import { HospitalPerformance, formatNaira } from "@/lib/reports-helpers";
import { Building2 } from "lucide-react";

interface HospitalPerformanceTableProps {
  data: HospitalPerformance[];
}

export default function HospitalPerformanceTable({ data }: HospitalPerformanceTableProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-100">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Hospital Performance</h3>
        <p className="text-xs text-slate-400 mt-1 font-semibold">Detailed breakdown by provider</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80 border-b border-slate-100">
            <tr>
              <th className="text-left py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Hospital</th>
              <th className="text-right py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Total Codes</th>
              <th className="text-right py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Approved</th>
              <th className="text-right py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Rejected</th>
              <th className="text-right py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Approved Value</th>
              <th className="text-right py-4 px-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Approval Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {data.map((hosp, index) => (
              <tr key={index} className="hover:bg-slate-50/50 transition-colors duration-150 group">
                <td className="py-4 px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 border border-slate-200/50 shrink-0 group-hover:bg-white group-hover:border-slate-300 transition-colors">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <span className="font-bold text-slate-800 leading-tight">{hosp.hospital}</span>
                  </div>
                </td>
                <td className="py-4 px-6 text-right font-mono font-bold text-slate-700">{hosp.totalCodes}</td>
                <td className="py-4 px-6 text-right">
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-100/50 text-xs font-bold px-2 py-0.5 rounded-md">
                    {hosp.approvedCodes}
                  </span>
                </td>
                <td className="py-4 px-6 text-right">
                  <span className="bg-rose-50 text-rose-700 border border-rose-100/50 text-xs font-bold px-2 py-0.5 rounded-md">
                    {hosp.rejectedCodes}
                  </span>
                </td>
                <td className="py-4 px-6 text-right font-mono font-bold text-emerald-600">{formatNaira(hosp.approvedAmount)}</td>
                <td className="py-4 px-6 text-right">
                  <span
                    className={cn(
                      "text-xs font-bold px-2.5 py-1 rounded-full border",
                      hosp.approvalRate > 85
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                        : hosp.approvalRate > 75
                        ? "bg-amber-50 text-amber-700 border-amber-200/50"
                        : "bg-rose-50 text-rose-700 border-rose-200/50"
                    )}
                  >
                    {hosp.approvalRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-xs font-semibold text-slate-400">
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
