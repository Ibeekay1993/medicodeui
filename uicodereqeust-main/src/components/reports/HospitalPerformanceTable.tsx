import { cn } from "@/lib/utils";
import { HospitalPerformance, formatNaira } from "@/lib/reports-helpers";

interface HospitalPerformanceTableProps {
  data: HospitalPerformance[];
}

export default function HospitalPerformanceTable({ data }: HospitalPerformanceTableProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-4">Hospital Performance</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-3 px-2 text-xs font-black uppercase tracking-widest text-slate-400">Hospital</th>
              <th className="text-right py-3 px-2 text-xs font-black uppercase tracking-widest text-slate-400">Total</th>
              <th className="text-right py-3 px-2 text-xs font-black uppercase tracking-widest text-slate-400">Approved</th>
              <th className="text-right py-3 px-2 text-xs font-black uppercase tracking-widest text-slate-400">Rejected</th>
              <th className="text-right py-3 px-2 text-xs font-black uppercase tracking-widest text-slate-400">Appr Amt</th>
              <th className="text-right py-3 px-2 text-xs font-black uppercase tracking-widest text-slate-400">Rate</th>
            </tr>
          </thead>
          <tbody>
            {data.map((hosp, index) => (
              <tr key={index} className={index % 2 === 0 ? "bg-slate-50/50" : ""}>
                <td className="py-3 px-2 font-semibold text-slate-900">{hosp.hospital}</td>
                <td className="py-3 px-2 text-right font-bold text-slate-700">{hosp.totalCodes}</td>
                <td className="py-3 px-2 text-right font-bold text-emerald-600">{hosp.approvedCodes}</td>
                <td className="py-3 px-2 text-right font-bold text-rose-600">{hosp.rejectedCodes}</td>
                <td className="py-3 px-2 text-right font-bold text-emerald-700">{formatNaira(hosp.approvedAmount)}</td>
                <td className="py-3 px-2 text-right">
                  <span
                    className={cn(
                      "text-xs font-bold",
                      hosp.approvalRate > 85
                        ? "text-emerald-600"
                        : hosp.approvalRate > 75
                        ? "text-amber-600"
                        : "text-rose-600"
                    )}
                  >
                    {hosp.approvalRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
