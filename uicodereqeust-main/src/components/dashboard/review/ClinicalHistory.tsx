import React, { useState } from "react";
import { format } from "date-fns";

interface ClinicalHistoryProps {
  request: any;
  visibleHistory: any[];
  historyPage: number;
  setHistoryPage: (page: number) => void;
  requestPatientName: string;
  requestPolicyNumber: string;
}

export function ClinicalHistory({
  request,
  visibleHistory,
  historyPage,
  setHistoryPage,
  requestPatientName,
  requestPolicyNumber,
}: ClinicalHistoryProps) {
  const [expanded, setExpanded] = useState(true);
  const [includeDependents, setIncludeDependents] = useState(false);

  return (
    <div className="w-full">
      <div className="bg-white rounded-2xl p-4 mb-3 border border-slate-100 shadow-sm">
        <div className="text-[13px] sm:text-[14px] font-extrabold text-slate-800 uppercase tracking-wide mb-3">
          Patient Clinical History
        </div>

        <div 
          className="flex justify-between items-center p-3.5 bg-white rounded-xl border border-slate-100 mb-3 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <div className="text-[16px]">🕒</div>
            <div className="text-[12px] sm:text-[13px] font-extrabold text-slate-800">
              PATIENT HISTORY (WORKBOOK)
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-slate-50 px-2.5 py-1 rounded-full text-[10px] font-bold text-slate-500">
              {visibleHistory.length || 5} RECORDS
            </div>
            <span className="text-slate-400">{expanded ? '▴' : '▾'}</span>
          </div>
        </div>

        {expanded && (
          <div className="bg-white rounded-xl p-4 border border-slate-100 mb-3">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-1.5">
                <div className="text-[10px] text-slate-400">Patient Name:</div>
                <div className="bg-slate-50 px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-800">
                  {requestPatientName || "AFOLAYAN SENAB"}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="text-[10px] text-slate-400">Policy Number:</div>
                <div className="bg-slate-50 px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-800">
                  {requestPolicyNumber || "1639554"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
              <div 
                className="w-9 h-5 rounded-full relative cursor-pointer transition-colors"
                style={{ backgroundColor: includeDependents ? '#10b981' : '#cbd5e1' }}
                onClick={() => setIncludeDependents(!includeDependents)}
              >
                <div 
                  className="absolute w-4 h-4 bg-white rounded-full top-0.5 transition-transform" 
                  style={{ left: includeDependents ? '18px' : '2px' }}
                />
              </div>
              <div className="text-[11px] font-semibold text-slate-400">
                Include records from other dependents
              </div>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {visibleHistory.length > 0 ? visibleHistory.map((record, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-3.5">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Date</div>
                      <div className="text-[11px] sm:text-[12px] font-semibold text-slate-800">
                        {record.date ? format(new Date(record.date), "dd/MM/yyyy") : "02/07/2026"}
                      </div>
                    </div>
                    <div className="bg-green-100 text-green-600 px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wider">
                      {record.status || "APPROVED"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200">
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Diagnosis</div>
                      <div className="text-[11px] sm:text-[12px] font-semibold text-slate-800">{record.diagnosis || "Malaria"}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Treatment</div>
                      <div className="text-[11px] sm:text-[12px] font-semibold text-slate-800">{record.treatment || "Artemether/Lumefantrine"}</div>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="bg-slate-50 rounded-xl p-3.5">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Date</div>
                      <div className="text-[11px] sm:text-[12px] font-semibold text-slate-800">02/07/2026</div>
                    </div>
                    <div className="bg-green-100 text-green-600 px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wider">
                      APPROVED
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200">
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Diagnosis</div>
                      <div className="text-[11px] sm:text-[12px] font-semibold text-slate-800">Malaria</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Treatment</div>
                      <div className="text-[11px] sm:text-[12px] font-semibold text-slate-800">Artemether/Lumefantrine</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
