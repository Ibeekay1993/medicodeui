import React, { useState } from "react";
import { format } from "date-fns";
import { normalizePatientNameForMatch, normalizePolicyNumber, normalizePolicyRoot } from "@/lib/clinicalUtils";
import { ChevronDown, ChevronUp, Clock3, Loader2 } from "lucide-react";

interface ClinicalHistoryProps {
  request: any;
  visibleHistory: any[];
  historyPage: number;
  setHistoryPage: (page: number) => void;
  requestPatientName: string;
  requestPolicyNumber: string;
  requestBeneficiaryNumber?: string | null;
  checking?: boolean;
  historyLoadFailed?: boolean;
  onRetryHistory?: () => void;
}

const HistoryCard = ({ record, showPatient }: { record: any; showPatient: boolean }) => {
  const [showFullNote, setShowFullNote] = useState(false);

  const displayValue = (value: unknown, fallback = "Not recorded") => {
    const text = String(value ?? "").trim();
    return !text || /^(null|undefined|nil|none|n\/?a)$/i.test(text) ? fallback : text;
  };
  const statusLabel = displayValue(record.status, "APPROVED");
  const status = statusLabel.toLowerCase();
  let statusClasses = "bg-slate-100 text-slate-600 border-slate-200";
  if (status.includes("reject") || status.includes("decline")) {
    statusClasses = "bg-red-100 text-red-700 border-red-200";
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
        const decision = p.review_decision || p.decision_reason;
        if (decision && !/^(null|undefined|nil|none|n\/?a)$/i.test(String(decision).trim())) parts.push(String(decision).trim());
        if (p.notes && !/^(null|undefined|nil|none|n\/?a)$/i.test(String(p.notes).trim())) parts.push(String(p.notes).trim());
        return parts.join(" • ");
      } catch { return t; }
    }
    return t;
  }

  const note = [record.decision_reason, record.note, record.clinical_notes]
    .map(parseNote)
    .find((value) => value && !/^(null|undefined|nil|none|n\/?a)$/i.test(value.trim())) || "";
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

  const markerTone = status.includes("reject") || status.includes("decline")
    ? "bg-rose-500 ring-rose-100"
    : status.includes("pending") || status.includes("defer")
      ? "bg-amber-500 ring-amber-100"
      : "bg-emerald-600 ring-emerald-100";

  return (
    <article className="relative pb-9 pl-7 last:pb-0 sm:pl-8">
      <span aria-hidden="true" className={`absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full ring-4 ${markerTone}`} />
      <span aria-hidden="true" className="absolute bottom-0 left-[6px] top-5 w-px bg-slate-200" />
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <time className="text-sm font-bold tabular-nums text-slate-900">{displayValue(displayDate, "Date unavailable")}</time>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClasses}`}>{statusLabel}</span>
            {record.authorization_code && record.authorization_code !== "-" && (
              <span className="font-mono text-xs font-semibold text-slate-600">{record.authorization_code}</span>
            )}
            {(record.is_historical || record.source === "sheet_history" || record.source === "historical") && (
              <span className="text-[10px] font-medium text-slate-500">Imported record</span>
            )}
          </div>
          {showPatient && (record.patient_name || record.name) && (
            <p className="mt-2 text-sm font-semibold text-slate-800">{displayValue(record.patient_name || record.name)}</p>
          )}
          {record.hospital_name && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{displayValue(record.hospital_name)}</p>
          )}
          <section className="mt-3 min-w-0">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Diagnosis</h4>
            <p className="mt-1 break-words text-sm font-semibold leading-relaxed text-slate-900">{displayValue(record.diagnosis)}</p>
          </section>
        </div>
        <section className="min-w-0 border-t border-slate-100 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Treatment &amp; quantity</h4>
          <p className="mt-1 break-words text-sm leading-relaxed text-slate-800">{displayValue(record.treatment)}</p>
        </section>
      </div>
        {note && (
          <section className="mt-3 border-t border-slate-100 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Clinical note</h4>
                <p className="mt-1 break-words text-sm leading-relaxed text-slate-700">{displayNote}</p>
              </div>
              {isLongNote && (
                <button type="button" aria-expanded={showFullNote} onClick={() => setShowFullNote(!showFullNote)} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                  {showFullNote ? <>Show less <ChevronUp className="h-3.5 w-3.5" /></> : <>Read note <ChevronDown className="h-3.5 w-3.5" /></>}
                </button>
              )}
            </div>
          </section>
        )}
    </article>
  );
};

export function ClinicalHistory({
  request,
  visibleHistory,
  historyPage,
  setHistoryPage,
  requestPatientName,
  requestPolicyNumber,
  requestBeneficiaryNumber,
  checking = false,
  historyLoadFailed = false,
  onRetryHistory,
}: ClinicalHistoryProps) {
  const [expanded, setExpanded] = useState(true);
  const [includeDependents, setIncludeDependents] = useState(false);

  // Filter history based on includeDependents toggle
  const currentPatientClean = normalizePatientNameForMatch(requestPatientName || "");
  const currentBeneficiaryNumber = normalizePolicyNumber(
    requestBeneficiaryNumber || request?.beneficiary_number || "",
  ).toUpperCase();
  const familyPolicyRoot = normalizePolicyRoot(requestPolicyNumber).toUpperCase();

  // Clean beneficiary ID by standardizing suffix (e.g. 2871167-02 -> 2871167-2)
  const normBenId = (val: string) => String(val || "").replace(/[^\dA-Za-z-]/g, "").replace(/-0+([1-9])/g, "-$1").toUpperCase();

  const filteredHistory = visibleHistory.filter((record) => {
    const recordPolicy = normalizePolicyNumber(record.policy_number || "").toUpperCase();
    const recordBen = normalizePolicyNumber(record.beneficiary_number || "").toUpperCase();
    const recordPolicyRoot = normalizePolicyRoot(recordPolicy || recordBen).toUpperCase();

    if (includeDependents) {
      // Include any record belonging to the same family policy root
      if (familyPolicyRoot && recordPolicyRoot === familyPolicyRoot) return true;
      if (familyPolicyRoot && (recordPolicy.includes(familyPolicyRoot) || recordBen.includes(familyPolicyRoot))) return true;
      return false;
    }

    const recordPatientClean = normalizePatientNameForMatch(record.patient_name || record.name || "");
    const storedBeneficiaryNumber = normBenId(record.beneficiary_number || "");
    const storedPolicyNumber = normBenId(record.policy_number || "");
    const cleanCurrentBen = normBenId(currentBeneficiaryNumber);

    const inferredBeneficiaryNumber = storedBeneficiaryNumber || (
      storedPolicyNumber && normalizePolicyRoot(storedPolicyNumber).toUpperCase() === familyPolicyRoot &&
      storedPolicyNumber !== familyPolicyRoot
        ? storedPolicyNumber
        : ""
    );

    // 1. Direct normalized beneficiary ID match (e.g. 2871167-2 === 2871167-2)
    if (cleanCurrentBen && inferredBeneficiaryNumber && inferredBeneficiaryNumber === cleanCurrentBen) {
      return true;
    }

    // 2. Exact patient name match within the same family policy
    if (currentPatientClean && recordPatientClean === currentPatientClean) {
      if (!familyPolicyRoot || recordPolicyRoot === familyPolicyRoot || !recordPolicyRoot) {
        return true;
      }
    }

    // 3. Fallback: if record has matching beneficiary ID
    return Boolean(cleanCurrentBen && inferredBeneficiaryNumber && inferredBeneficiaryNumber === cleanCurrentBen);
  });
  return (
    <div className="w-full">
      <div className="bg-white rounded-2xl p-4 mb-3 border border-slate-100 shadow-sm">
        <div className="mb-3 text-sm font-bold text-slate-900 sm:text-base">
          Patient clinical history
        </div>

        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="mb-3 flex min-h-12 w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <div className="text-[12px] sm:text-[13px] font-extrabold text-slate-800">
              Patient authorization history
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
                <span aria-live="polite">{filteredHistory.length} {filteredHistory.length === 1 ? "record" : "records"}</span>
              )}
            </div>
            {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </div>
        </button>

        {expanded && (
          <div className="mb-2 bg-white px-1 py-2 sm:px-2">
            <div className="mb-3 grid grid-cols-1 gap-2 border-b border-slate-100 pb-3 sm:grid-cols-3">
              {currentBeneficiaryNumber && <div className="min-w-0">
                <div className="text-[10px] font-medium text-slate-500">Beneficiary ID</div>
                <div className="mt-0.5 truncate font-mono text-xs font-semibold text-slate-900">
                  {currentBeneficiaryNumber}
                </div>
              </div>}
              <div className="min-w-0">
                <div className="text-[10px] font-medium text-slate-500">Patient name</div>
                <div className="mt-0.5 truncate text-xs font-semibold text-slate-900">
                  {requestPatientName || "Unknown"}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-medium text-slate-500">Policy number</div>
                <div className="mt-0.5 truncate text-xs font-semibold text-slate-900">
                  {requestPolicyNumber || "Unknown"}
                </div>
              </div>
            </div>

            <div className="mb-3 border-b border-slate-100 pb-3">
              <button
                type="button"
                role="switch"
                aria-checked={includeDependents}
                aria-label="Include authorization history for other dependents"
                className="group flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                onClick={() => setIncludeDependents((value) => !value)}
              >
                <span aria-hidden="true" className={`relative block h-6 w-11 shrink-0 rounded-full transition-colors ${includeDependents ? "bg-emerald-600" : "bg-slate-300"}`}>
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${includeDependents ? "translate-x-5" : "translate-x-0"}`} />
                </span>
                <span className="text-xs text-slate-700 group-hover:text-slate-900">
                  <span className="block font-semibold">Include records from other dependents</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {includeDependents ? "Showing this patient and other dependents" : "Showing this patient only"}
                  </span>
                </span>
              </button>
            </div>

            <div className="max-h-[min(60vh,560px)] overflow-y-auto overscroll-contain pl-1 pr-1 sm:max-h-[560px]">
              {checking ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center bg-slate-50/50 animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto mb-2" />
                  <p className="text-[12px] font-bold text-slate-700">Checking patient clinical records...</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Searching authorization registry for policy and family history</p>
                </div>
              ) : historyLoadFailed ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-[12px] font-semibold text-amber-900">
                  <p>Authorization history could not be loaded. Your records have not been changed.</p>
                  {onRetryHistory && (
                    <button
                      type="button"
                      onClick={onRetryHistory}
                      className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg border border-amber-300 bg-white px-4 font-bold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
                    >
                      Retry history lookup
                    </button>
                  )}
                </div>
              ) : filteredHistory.length > 0 ? (
                filteredHistory.map((record, i) => (
                  <HistoryCard key={record.id || record.authorization_code || i} record={record} showPatient={includeDependents} />
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
