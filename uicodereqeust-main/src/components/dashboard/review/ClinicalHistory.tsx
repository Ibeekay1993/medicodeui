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
  const [showFamilyHistory, setShowFamilyHistory] = React.useState(false);
  const historyPageSize = 5;

  const historyRows = React.useMemo(() => {
    if (showFamilyHistory) return visibleHistory;
    
    const reqName = String(requestPatientName || "").toLowerCase();
    const reqTokens = reqName.split(/[\s,]+/).filter(Boolean);
    
    if (reqTokens.length === 0) return visibleHistory;

    return visibleHistory.filter((record) => {
      const rowName = String(record?.patient_name || "").toLowerCase();
      const rowTokens = rowName.split(/[\s,]+/).filter(Boolean);
      let matches = 0;
      for (const token of reqTokens) {
        if (rowTokens.some((rt) => rt === token || rt.includes(token) || token.includes(rt))) {
          matches++;
        }
      }
      return matches >= Math.max(2, reqTokens.length) || (matches > 0 && reqTokens.length === 1);
    });
  }, [visibleHistory, requestPatientName, showFamilyHistory]);

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
            {historyRows.length} record{historyRows.length !== 1 ? "s" : ""}
          </Badge>
          {collapsed ? (
            <ChevronDown className="w-4.5 h-4.5 text-slate-500" />
          ) : (
            <ChevronUp className="w-4.5 h-4.5 text-slate-500" />
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="px-4 pt-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-150 bg-gradient-to-r from-slate-50/80 to-white px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 shadow-sm md:flex-row md:items-center md:justify-between transition-all">
              <div className="flex flex-col gap-1.5">
                <p className="flex items-center flex-wrap">
                  Viewing history for: <span className="text-slate-800 font-extrabold bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-xs ml-1.5">{requestPatientName || "Unknown patient"}</span>
                </p>
                <label className="flex items-center gap-2.5 cursor-pointer w-fit group mt-0.5">
                  <div className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-300 ease-in-out shadow-inner" style={{ backgroundColor: showFamilyHistory ? '#10b981' : '#e2e8f0' }}>
                    <input 
                      type="checkbox" 
                      className="peer sr-only"
                      checked={showFamilyHistory}
                      onChange={(e) => {
                        setShowFamilyHistory(e.target.checked);
                        setHistoryPage(1);
                      }}
                    />
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-300 ease-in-out ${showFamilyHistory ? 'translate-x-5' : 'translate-x-0.5'}`}
                    />
                  </div>
                  <span className="text-[10px] font-black tracking-widest uppercase transition-colors group-hover:text-primary mt-0.5">Show full family history</span>
                </label>
              </div>
              <div className="text-[10px] sm:text-xs md:text-right mt-1 md:mt-0">
                Policy: <span className="font-extrabold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-xs ml-1">{requestPolicyNumber || "N/A"}</span>
              </div>
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
