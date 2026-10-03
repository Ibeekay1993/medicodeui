import React, { useState } from "react";
import { format } from "date-fns";
import { normalizePatientNameForMatch } from "@/lib/clinicalUtils";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface ClinicalHistoryProps {
  request: any;
  visibleHistory: any[];
  historyPage: number;
  setHistoryPage: (page: number) => void;
  requestPatientName: string;
  requestPolicyNumber: string;
  checking?: boolean;
}

const HistoryCard = ({ record }: { record: any }) => {
  const [showFullNote, setShowFullNote] = useState(false);
  
  const status = (record.status || "APPROVED").toLowerCase();
  let statusClasses = "bg-slate-100 text-slate-600 border-slate-200";
  let cardBorderClasses = "border-slate-200/80";

  if (status.includes("reject") || status.includes("decline")) {
    statusClasses = "bg-red-100 text-red-700 border-red-200";
    cardBorderClasses = "border-red-200 bg-red-50/30";
  } else if (status.includes("approve")) {
    statusClasses = "bg-emerald-100 text-emerald-700 border-emerald-200";
  } else if (status.includes("pending") || status.includes("defer")) {
    statusClasses = "bg-amber-100 text-amber-700 border-amber-200";
  }

  // Parse JSON blobs from WhatsApp-sourced clinical_notes
  function parseNote(value: unknown): string {
    if (!value || typeof value !== "string") return "";
    const t = value.trim();
    if (t.startsWith("{") && t.endsWith("}")) {
      try {
        const p = JSON.parse(t);
        const parts: string[] = [];
        if (p.review_decision) parts.push(p.review_decision);
        else if (p.decision_reason) parts.push(p.decision_reason);
        if (p.notes) parts.push(p.notes);
        return parts.join(" • ");
      } catch { return t; }
    }
    return t;
  }

  const note = parseNote(record.decision_reason) || parseNote(record.note) || parseNote(record.clinical_notes) || "";
  const isLongNote = note.length > 80;
  const displayNote = showFullNote ? note : (isLongNote ? note.substring(0, 80) + "..." : note);

  // Unified date extraction — handles ISO timestamps and pre-formatted date strings
  const rawDate = record.date || record.decided_at || record.created_at;
  let displayDate = "Date unavailable";
  if (rawDate) {
    if (typeof rawDate === "string" && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(rawDate.trim())) {
      displayDate = rawDate.trim();
    } else {
      const parsedDate = new Date(rawDate);
      displayDate = !isNaN(parsedDate.getTime()) ? format(parsedDate, "dd/MM/yyyy") : String(rawDate);
    }
  }

  return (
    <div className={`rounded-xl p-3.5 border ${cardBorderClasses} shadow-sm transition-all mb-3 bg-slate-50`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3 pb-3 border-b border-slate-200">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Date</div>
              <div className="text-[11px] sm:text-[12px] font-extrabold text-slate-900">
                {displayDate}
              </div>
            </div>
            {(record.patient_name || record.name) && (
              <div className="flex items-center gap-1.5">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Patient</div>
                <div className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wide">
                  {record.patient_name || record.name}
                </div>
              </div>
            )}
            {record.authorization_code && record.authorization_code !== "-" && (
              <div className="flex items-center gap-1.5">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Auth Code</div>
                <div className="text-[11px] sm:text-[12px] font-extrabold text-slate-900 tracking-wide bg-white px-2 py-0.5 rounded border border-slate-200 shadow-sm">
                  {record.authorization_code}
                </div>
              </div>
            )}
          </div>
          {record.hospital_name && (
            <div className="flex items-center gap-1.5">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Hospital</div>
              <div className="text-[11px] sm:text-[12px] font-bold text-slate-700">
                {record.hospital_name}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-widest border w-fit shadow-sm ${statusClasses}`}>
            {record.status || "APPROVED"}
          </div>
          {/* Historical badge for legacy imported records; live records need no duplicate badge */}
          {(record.is_historical || record.source === "sheet_history" || record.source === "historical") && (
            <div className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest bg-indigo-50 text-indigo-700 border border-indigo-200 w-fit">
              Historical
            </div>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm">
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Diagnosis</div>
          <div className="text-[12px] sm:text-[13px] font-extrabold text-slate-900 leading-snug">{record.diagnosis || "Not recorded"}</div>
        </div>
        <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm">
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Treatment & Quantity</div>
          <div className="text-[12px] sm:text-[13px] font-extrabold text-slate-900 leading-snug">{record.treatment || "Not recorded"}</div>
        </div>
      </div>

      {note && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex justify-between items-start gap-2">
            <div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Clinical Note / Reason</div>
              <div className="text-[11px] sm:text-[12px] font-bold text-slate-700 leading-relaxed break-words">
                {displayNote}
              </div>
            </div>
            {isLongNote && (
              <button 
                onClick={() => setShowFullNote(!showFullNote)}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded-md transition-colors shrink-0 flex items-center gap-1"
              >
                {showFullNote ? (
                  <>Show Less <ChevronUp className="w-3 h-3" /></>
                ) : (
                  <>Show More <ChevronDown className="w-3 h-3" /></>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export function ClinicalHistory({
  request,
  visibleHistory,
  historyPage,
  setHistoryPage,
  requestPatientName,
  requestPolicyNumber,
  checking = false,
}: ClinicalHistoryProps) {
  const [expanded, setExpanded] = useState(true);
  const [includeDependents, setIncludeDependents] = useState(true);

  // Filter history based on includeDependents toggle
  const currentPatientClean = normalizePatientNameForMatch(requestPatientName || "");
  const currentPatientWords = currentPatientClean.split(/\s+/).filter(Boolean);

  const filteredHistory = visibleHistory.filter((record) => {
    if (includeDependents) return true;
    const recordPatientClean = normalizePatientNameForMatch(record.patient_name || record.name || "");
    if (!recordPatientClean || !currentPatientClean) return true;
    if (recordPatientClean === currentPatientClean) return true;
    if (recordPatientClean.includes(currentPatientClean) || currentPatientClean.includes(recordPatientClean)) return true;
    
    const recordWords = recordPatientClean.split(/\s+/).filter(Boolean);
    const commonWords = currentPatientWords.filter(w => recordWords.includes(w));
    return commonWords.length >= Math.min(2, Math.max(1, currentPatientWords.length));
  });

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
              PATIENT AUTHORIZATION HISTORY
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-slate-50 px-2.5 py-1 rounded-full text-[10px] font-bold text-slate-500 flex items-center gap-1.5">
              {checking ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                  <span>SEARCHING...</span>
                </>
              ) : (
                <span>{filteredHistory.length} RECORDS</span>
              )}
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
                  {requestPatientName || "Unknown"}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="text-[10px] text-slate-400">Policy Number:</div>
                <div className="bg-slate-50 px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-800">
                  {requestPolicyNumber || "Unknown"}
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

            <div className="max-h-[350px] overflow-y-auto pr-1">
              {checking ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center bg-slate-50/50 animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto mb-2" />
                  <p className="text-[12px] font-bold text-slate-700">Checking patient clinical records...</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Searching authorization registry for policy and family history</p>
                </div>
              ) : filteredHistory.length > 0 ? (
                filteredHistory.map((record, i) => (
                  <HistoryCard key={i} record={record} />
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[12px] font-semibold text-slate-500">
                  No matching authorization history found.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
