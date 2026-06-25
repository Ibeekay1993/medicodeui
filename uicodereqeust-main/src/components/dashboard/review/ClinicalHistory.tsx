import React, { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { cleanPatientName, cleanDiagnosisText } from "@/lib/clinicalUtils";

interface ClinicalHistoryProps {
  request: any;
  visibleHistory: any[];
  historyPage: number;
  setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
  requestPatientName: string;
  requestPolicyNumber: string;
}

export function ClinicalHistory({
  request: _request,
  visibleHistory,
  historyPage,
  setHistoryPage,
  requestPatientName,
  requestPolicyNumber,
}: ClinicalHistoryProps) {
  const [collapsed, setCollapsed] = React.useState(true);
  const historyPageSize = 5;

  const historyRows = visibleHistory;
  const historyPageCount = Math.max(1, Math.ceil(historyRows.length / historyPageSize));
  const paginatedHistory = historyRows.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize
  );

  useEffect(() => {
    setHistoryPage((current) => Math.min(current, historyPageCount));
  }, [historyPageCount, setHistoryPage]);

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full cursor-pointer px-4 py-3 flex items-center justify-between bg-slate-50/80 hover:bg-slate-50 border-b border-slate-100 transition-colors"
      >
        <p className="text-xs font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" /> Patient History (Workbook)
        </p>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs font-black uppercase bg-white border-slate-200 text-slate-600 shadow-xs"
          >
            {visibleHistory.length} record{visibleHistory.length !== 1 ? "s" : ""}
          </Badge>
          {collapsed ? (
            <ChevronDown className="w-4.5 h-4.5 text-slate-500" />
          ) : (
            <ChevronUp className="w-4.5 h-4.5 text-slate-500" />
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="animate-in fade-in duration-200">
          <div className="px-4 pt-3.5">
            <div className="flex flex-col gap-2 rounded-xl border border-slate-150 bg-slate-50/50 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 md:flex-row md:items-center md:justify-between">
              <p>
                Viewing history for: <span className="text-slate-800 font-extrabold">{requestPatientName || "Unknown patient"}</span>
              </p>
              <p className="font-mono text-slate-700">
                Policy: {requestPolicyNumber || "---"}
              </p>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {paginatedHistory.length > 0 ? (
              paginatedHistory.map((record: any) => {
                const historyDate =
                  record.date ||
                  (record.decided_at
                    ? new Date(record.decided_at).toLocaleDateString("en-GB")
                    : record.created_at
                    ? new Date(record.created_at).toLocaleDateString("en-GB")
                    : "Unknown date");

                return (
                  <div
                    key={record.id || `${record.date}-${record.authorization_code}`}
                    className="rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-350 transition-colors shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Date</p>
                        <p className="text-xs font-bold text-slate-900 leading-tight">{historyDate}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-xs font-black uppercase bg-emerald-50 border-emerald-250 text-emerald-700 shrink-0"
                      >
                        {record.status || "approved"}
                      </Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs md:text-xs border-t border-slate-100 pt-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Name</p>
                        <p className="font-bold text-slate-700 leading-tight truncate">
                          {cleanPatientName(record.patient_name) || "Unknown patient"}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Policy No.</p>
                        <p className="font-mono font-semibold text-slate-700 leading-tight truncate">
                          {record.policy_number || "---"}
                        </p>
                      </div>
                      <div className="min-w-0 col-span-2 md:col-span-1">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Diagnosis</p>
                        <p className="font-medium text-slate-750 leading-snug break-words">
                          {cleanDiagnosisText(
                            record.diagnosis || record.diagnosis_services || "-",
                            record.patient_name
                          )}
                        </p>
                      </div>
                      <div className="min-w-0 col-span-2 md:col-span-1">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Service</p>
                        <p className="font-medium text-slate-750 leading-snug break-words">
                          {record.treatment || record.diagnosis_services || "-"}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Code</p>
                        <p className="font-mono font-bold text-emerald-700 leading-tight">
                          {record.authorization_code || record.code || "Pending"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-center py-6 text-slate-400 text-xs font-semibold">
                No past records found for this policy number.
              </p>
            )}
          </div>

          {historyRows.length > historyPageSize && (
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                Page {historyPage} of {historyPageCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-xl text-xs font-black uppercase px-3 shadow-xs"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-xl text-xs font-black uppercase px-3 shadow-xs"
                  disabled={historyPage >= historyPageCount}
                  onClick={() => setHistoryPage((current) => Math.min(historyPageCount, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
