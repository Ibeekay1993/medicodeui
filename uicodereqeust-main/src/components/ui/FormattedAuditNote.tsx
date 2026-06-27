import { CheckCircle2, XCircle, AlertTriangle, Shield, FileText, TrendingUp, TrendingDown, Minus } from "lucide-react";

/**
 * Parses and renders AI clinical audit notes as a beautifully structured card
 * instead of raw notepad-style text. Used on both claims and hospital sides.
 */
export function FormattedAuditNote({ text }: { text: string }) {
  const isAutomated =
    text.includes("AUTOMATED CLINICAL AUDIT COMPLETED") ||
    text.includes("AI CLINICAL AUDIT COMPLETED");

  // For non-automated notes, still render nicely
  if (!isAutomated) {
    return <SimpleFormattedNote text={text} />;
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Extract header info
  const claimRef = lines.find((l) => l.startsWith("Claim Reference:"))?.replace("Claim Reference:", "").trim();
  const status = lines.find((l) => l.startsWith("Status:"))?.replace("Status:", "").trim();
  const reason = lines.find((l) => l.startsWith("Reason:"))?.replace("Reason:", "").trim();

  // Extract sections
  const approvedIdx = lines.findIndex((l) => l.startsWith("APPROVED ITEMS:"));
  const declinedIdx = lines.findIndex((l) => l.startsWith("DECLINED ITEMS"));
  const summaryIdx = lines.findIndex((l) => l.startsWith("SUMMARY OF ADJUSTMENTS:"));

  const approvedItems =
    approvedIdx !== -1
      ? lines
          .slice(approvedIdx + 1, declinedIdx !== -1 ? declinedIdx : summaryIdx !== -1 ? summaryIdx : lines.length)
          .filter((l) => l.startsWith("•") || l.startsWith("-"))
          .map((l) => l.replace(/^[•\-]\s*/, ""))
      : [];

  const declinedItems =
    declinedIdx !== -1
      ? lines
          .slice(declinedIdx + 1, summaryIdx !== -1 ? summaryIdx : lines.length)
          .filter((l) => l.startsWith("•") || l.startsWith("-"))
          .map((l) => l.replace(/^[•\-]\s*/, ""))
      : [];

  const noneDeclined =
    declinedIdx !== -1 &&
    declinedItems.length === 0 &&
    lines.slice(declinedIdx + 1, summaryIdx !== -1 ? summaryIdx : lines.length).some((l) => l.toLowerCase() === "none");

  // Extract financial summary
  const requestedAmount = lines.find((l) => l.includes("Requested Amount:"))?.replace(/.*Requested Amount:\s*/, "").trim();
  const approvedPayout = lines.find((l) => l.includes("Approved Payout:"))?.replace(/.*Approved Payout:\s*/, "").trim();
  const penalty = lines.find((l) => l.includes("Deducted Penalty:"))?.replace(/.*Deducted Penalty:\s*/, "").trim();

  // Extract footer note
  const footerLines = lines.filter(
    (l) =>
      l.startsWith("Audit completed") ||
      l.startsWith("Hospital may") ||
      l.includes("clinical policy review") ||
      l.includes("appeal")
  );

  // Status colors
  const statusColor =
    status?.toLowerCase().includes("approved")
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : status?.toLowerCase().includes("declined") || status?.toLowerCase().includes("rejected")
      ? "bg-rose-100 text-rose-800 border-rose-200"
      : "bg-amber-100 text-amber-800 border-amber-200";

  const StatusIcon = status?.toLowerCase().includes("approved")
    ? CheckCircle2
    : status?.toLowerCase().includes("declined")
    ? XCircle
    : AlertTriangle;

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">AI Clinical Audit</p>
            {claimRef && <p className="text-[10px] font-mono font-semibold text-slate-400 mt-0.5">{claimRef}</p>}
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-bold border ${statusColor}`}>
          <StatusIcon className="w-3 h-3" />
          {status}
        </div>
      </div>

      {/* Reason Banner */}
      {reason && (
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs font-medium text-slate-700 leading-relaxed">
          <span className="font-bold text-slate-800">Reason: </span>
          {reason}
        </div>
      )}

      {/* Approved Items */}
      {approvedItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Approved Items</span>
            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">{approvedItems.length}</span>
          </div>
          <div className="space-y-1">
            {approvedItems.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100/60 text-xs font-medium text-slate-700"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="leading-snug">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Declined Items */}
      {(declinedItems.length > 0 || noneDeclined) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-700">Excluded from Payout</span>
            {declinedItems.length > 0 && (
              <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">{declinedItems.length}</span>
            )}
          </div>
          {noneDeclined && declinedItems.length === 0 ? (
            <div className="py-2 px-3 rounded-lg bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-500 italic">
              None — all items approved
            </div>
          ) : (
            <div className="space-y-1">
              {declinedItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-lg bg-rose-50/50 border border-rose-100/60 text-xs font-medium text-slate-700"
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                  <span className="leading-snug">{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Financial Summary */}
      {requestedAmount && (
        <div className="bg-gradient-to-br from-slate-50 to-slate-100/80 rounded-xl p-3 border border-slate-200/60 shadow-sm">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2.5">Financial Summary</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <FileText className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] font-semibold text-slate-500">Requested</span>
              </div>
              <span className="font-mono text-sm font-bold text-slate-800 block">{requestedAmount}</span>
            </div>
            <div className="text-center border-x border-slate-200/60">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] font-semibold text-emerald-600">Approved</span>
              </div>
              <span className="font-mono text-sm font-bold text-emerald-700 block">{approvedPayout}</span>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                {penalty === "₦0" || penalty === "N0" ? (
                  <Minus className="w-3 h-3 text-slate-400" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-rose-500" />
                )}
                <span className={`text-[10px] font-semibold ${penalty === "₦0" || penalty === "N0" ? "text-slate-500" : "text-rose-600"}`}>
                  Penalty
                </span>
              </div>
              <span className={`font-mono text-sm font-bold block ${penalty === "₦0" || penalty === "N0" ? "text-slate-500" : "text-rose-700"}`}>
                {penalty}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Footer Note */}
      {footerLines.length > 0 && (
        <p className="text-[10px] font-medium text-slate-400 leading-relaxed border-t border-slate-100 pt-3 mt-1">
          {footerLines.join(" ")}
        </p>
      )}
    </div>
  );
}

/** Renders non-automated notes with basic formatting instead of raw pre-text */
function SimpleFormattedNote({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center">
          <FileText className="w-3.5 h-3.5 text-white" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Clinical Notes</p>
      </div>
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <p key={i} className="text-xs font-medium text-slate-700 leading-relaxed">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
