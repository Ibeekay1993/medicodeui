import { 
  Loader2, 
  FolderOpen, 
  Copy, 
  Building, 
  XCircle, 
  AlertCircle, 
  CheckCircle2 
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormattedAuditNote } from "@/components/ui/FormattedAuditNote";
import { cn } from "@/lib/utils";
import { ClaimDraft, AuditDecision, money, splitClaimNotes } from "@/lib/claims-helpers";

// RenderAuditNote is now provided by the shared FormattedAuditNote component

interface ClaimAuditDrawerProps {
  selectedClaim: ClaimDraft;
  isMobileDetailOpen: boolean;
  setIsMobileDetailOpen: (open: boolean) => void;
  verificationData: {
    exists: boolean;
    authRequest: any | null;
    approvedItems: any[];
    loading: boolean;
    mismatchReasons: string[];
  };
  auditDecisions: Record<string, AuditDecision>;
  declinedItemCodes: string[];
  auditSummary: {
    original: number;
    approved: number;
    declined: number;
    savings: number;
    approvedCount: number;
    declinedCount: number;
    finalStatus: string;
  };
  role: string | null;
  openApprovalDialog: (key: string, item: any) => void;
  openDeclineDialog: (key: string, item: any) => void;
  adjustItemQuantity: (key: string, item: any) => void;
  handleStatusUpdate: (
    claimId: string,
    newStatus: "approved" | "partially_approved" | "rejected",
    approvedAmount?: number,
    auditNote?: string
  ) => Promise<void>;
  copyToClipboard: (text: string, label: string) => void;
  calculatedApprovedAmount: number;
}

export default function ClaimAuditDrawer({
  selectedClaim,
  isMobileDetailOpen,
  setIsMobileDetailOpen,
  verificationData,
  auditDecisions,
  declinedItemCodes,
  auditSummary,
  role,
  openApprovalDialog,
  openDeclineDialog,
  adjustItemQuantity,
  handleStatusUpdate,
  copyToClipboard,
  calculatedApprovedAmount
}: ClaimAuditDrawerProps) {
  if (!isMobileDetailOpen) return null;

  const itemKey = (item: any, index?: number) => String(item.code || item.name || index || "item");
  const itemUnit = (item: any) => Number(item.unit_price ?? item.price ?? 0);
  const itemQty = (item: any) => Math.max(1, Number(item.quantity ?? 1));

  return (
    <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full sm:max-w-3xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl sm:rounded-2xl rounded-t-3xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto flex flex-col shadow-2xl relative slide-in-from-bottom duration-300">
        {/* Drawer Drag handle (mobile only) */}
        <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto my-3 sm:hidden" />
        
        {/* Header */}
        <div className="px-6 py-4 flex justify-between items-center border-b border-slate-100 shrink-0">
          <div>
            <span className="text-xs font-semibold text-slate-500 leading-none">Claims Audit Portal</span>
            <h3 className="text-base font-semibold text-slate-900 mt-1 tracking-tight flex items-center gap-2">
              Audit Claim Details
              <Badge className={cn("border-none text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize",
                selectedClaim.status === "approved" ? "bg-emerald-500/10 text-emerald-600" :
                selectedClaim.status === "partially_approved" ? "bg-emerald-500/10 text-emerald-700" :
                selectedClaim.status === "paid" ? "bg-blue-500/10 text-blue-600" :
                selectedClaim.status === "rejected" ? "bg-rose-500/10 text-rose-600" :
                "bg-amber-500/10 text-amber-600"
              )}>
                {selectedClaim.status === "submitted" ? "pending" : (selectedClaim.status || "").replace("_", " ")}
              </Badge>
            </h3>
            <p className="text-xs font-mono font-semibold text-slate-500 mt-1">Claim Ref: {selectedClaim.claim_number}</p>
          </div>
          <button 
            onClick={() => setIsMobileDetailOpen(false)}
            className="text-xs font-semibold text-slate-600 hover:text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100 active:scale-95 transition-all"
          >
            Close Window
          </button>
        </div>

        {/* Content Body */}
        <div className="px-6 py-5 flex-1 overflow-y-auto">
          <div className="grid gap-6 md:grid-cols-12 items-start">
            
            {/* Left Column: Premium Audit Compliance Workstation */}
            <div className="space-y-4 md:col-span-6">
              
              {/* Visual Compliance Guardrails Widget */}
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                  <h4 className="text-xs font-semibold text-slate-750 flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
                    Audit Compliance Guardrails
                  </h4>
                  <Badge className="border-none text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5">
                    International Standards (HMO-v2.0)
                  </Badge>
                </div>

                <div className="grid gap-2 text-xs">
                  {/* Check 1: Patient Name Match */}
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-55 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        verificationData.mismatchReasons.some(r => r.includes("Patient Name")) ? "bg-rose-500" : "bg-emerald-500"
                      )} />
                      <span className="font-semibold text-slate-600">Patient Identity Check</span>
                    </div>
                    <span className={cn(
                      "font-semibold text-xs",
                      verificationData.mismatchReasons.some(r => r.includes("Patient Name")) ? "text-rose-600" : "text-emerald-600"
                    )}>
                      {verificationData.mismatchReasons.some(r => r.includes("Patient Name")) ? "MISMATCH" : "VERIFIED"}
                    </span>
                  </div>

                  {/* Check 2: Policy ID Verification */}
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-55 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        verificationData.mismatchReasons.some(r => r.includes("Enrollment ID")) ? "bg-rose-500" : "bg-emerald-500"
                      )} />
                      <span className="font-semibold text-slate-600">Enrollment ID Check</span>
                    </div>
                    <span className={cn(
                      "font-semibold text-xs",
                      verificationData.mismatchReasons.some(r => r.includes("Enrollment ID")) ? "text-rose-600" : "text-emerald-600"
                    )}>
                      {verificationData.mismatchReasons.some(r => r.includes("Enrollment ID")) ? "MISMATCH" : "VERIFIED"}
                    </span>
                  </div>

                  {/* Check 3: Claim Ownership & Referrals */}
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-55 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        verificationData.mismatchReasons.some(r => r.includes("ownership")) ? "bg-amber-500" : "bg-emerald-500"
                      )} />
                      <span className="font-semibold text-slate-600">Claim Ownership Check</span>
                    </div>
                    <span className={cn(
                      "font-semibold text-xs",
                      verificationData.mismatchReasons.some(r => r.includes("ownership")) ? "text-amber-600" : "text-emerald-600"
                    )}>
                      {verificationData.mismatchReasons.some(r => r.includes("ownership")) ? "WARNING" : "AUTHORIZED"}
                    </span>
                  </div>

                  {/* Check 4: Pre-authorization Validity */}
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-55 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        !verificationData.exists ? "bg-rose-500" : "bg-emerald-500"
                      )} />
                      <span className="font-semibold text-slate-600">Clinical Pre-Auth Check</span>
                    </div>
                    <span className={cn(
                      "font-semibold text-xs",
                      !verificationData.exists ? "text-rose-600" : "text-emerald-600"
                    )}>
                      {!verificationData.exists ? "MISSING/FORGED" : "ACTIVE"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Patient Enrollment Card */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-xs font-semibold text-slate-500">Patient Name</p>
                  <p className="text-sm font-semibold text-slate-900 leading-snug mt-0.5">{selectedClaim.patient_name}</p>
                  <p className="text-xs font-mono font-medium text-slate-500 mt-1 flex items-center gap-1.5 leading-none">
                    ID: {selectedClaim.policy_number}
                    <button onClick={() => copyToClipboard(selectedClaim.policy_number, "Enrollment ID")} className="text-slate-400 hover:text-slate-600"><Copy className="w-2.5 h-2.5" /></button>
                  </p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-xs font-semibold text-slate-500">Requesting Facility</p>
                  <p className="text-sm font-semibold text-slate-700 leading-snug mt-0.5 truncate">{selectedClaim.hospital_name}</p>
                  <p className="text-xs font-semibold text-emerald-600 mt-1 flex items-center gap-1">
                    <Building className="w-2.5 h-2.5" /> Checked & Verified
                  </p>
                </div>
              </div>

              {/* Match warning and details box */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-500">Database Validation Status</span>
                {verificationData.loading ? (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-2 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500">Verifying Clinical Records...</span>
                  </div>
                ) : !verificationData.exists ? (
                  <div className="bg-rose-50/50 border border-rose-100 p-3 rounded-xl space-y-1.5">
                    <div className="flex items-center gap-2 text-rose-700">
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span className="text-xs font-semibold text-rose-750">Forgery Detection Alert</span>
                    </div>
                    <p className="text-xs font-semibold text-rose-600 leading-relaxed">
                      No clinical authorization matching code <span className="font-mono text-rose-800 font-semibold">'{selectedClaim.auth_code}'</span> exists in the database. Direct approval is locked.
                    </p>
                  </div>
                ) : verificationData.mismatchReasons.length > 0 ? (
                  <div className="bg-rose-50/50 border border-rose-100 p-3 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-rose-700">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span className="text-xs font-semibold text-rose-750">Fraud / Mismatch Alert</span>
                    </div>
                    <ul className="list-disc list-inside text-xs font-semibold text-rose-600 space-y-1 leading-relaxed">
                      {verificationData.mismatchReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                    <p className="text-xs font-semibold text-rose-500 mt-1">Manual audit required. Direct approval has been locked.</p>
                  </div>
                ) : (
                  <div className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl space-y-1.5">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-xs font-semibold text-emerald-750">100% Clinically Verified</span>
                    </div>
                    <p className="text-xs font-medium text-emerald-600 leading-relaxed">
                      Claim details perfectly match approved Clinical Pre-Authorization record <span className="font-mono font-bold text-emerald-700">#{verificationData.authRequest?.request_id}</span>.
                    </p>
                  </div>
                )}
              </div>

              {/* Preauthorization Info & Diagnosis */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-xs font-semibold text-slate-500">Preauthorization Reference</p>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs font-mono font-semibold text-slate-900 leading-none">{selectedClaim.auth_code}</span>
                    <button onClick={() => copyToClipboard(selectedClaim.auth_code, "Auth Code")} className="text-slate-400 hover:text-slate-600"><Copy className="w-3 h-3" /></button>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <p className="text-xs font-semibold text-slate-500">Clinical Diagnosis</p>
                  <p className="text-xs font-semibold text-slate-900 leading-snug mt-1 truncate">{verificationData.authRequest?.diagnosis || "Not Specified"}</p>
                </div>
              </div>

              {/* World Standard clinical guidelines check assistant */}
              {verificationData.exists && (
                <div className="rounded-2xl border border-blue-100 bg-white p-4 space-y-2 shadow-sm">
                  <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Clinical Guideline Match
                  </p>
                  <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                    Auditing for Diagnosis: <span className="font-semibold text-slate-800">{verificationData.authRequest?.diagnosis || "Not Specified"}</span>.
                    Ensure procedures match standardized pathways for this diagnostic class. Check that billed quantities align with treatment durations and price lists match authorized reference tariffs.
                  </p>
                </div>
              )}

              {selectedClaim.notes && (() => {
                const noteSections = splitClaimNotes(selectedClaim.notes);
                const hasClinical = noteSections.clinical && noteSections.clinical.trim().length > 0;
                const hasAudit = noteSections.audit && noteSections.audit.trim().length > 0;
                if (!hasClinical && !hasAudit) return null;
                return (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-500 font-sans">Clinical Notes & Audit logs</span>
                    <div className="grid gap-2">
                      {hasClinical && (
                        <div className="rounded-xl border border-slate-100 bg-white p-3">
                          <FormattedAuditNote text={noteSections.clinical} />
                        </div>
                      )}
                      {hasAudit && (
                        <div className="rounded-xl border border-amber-100 bg-gradient-to-b from-amber-50/80 to-amber-50/30 p-4 shadow-sm">
                          <FormattedAuditNote text={noteSections.audit} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {(selectedClaim.status === "contested" || selectedClaim.status === "under_contest") && (
                <div className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <span className="text-xs font-semibold text-amber-700 block">Contest Awaiting Re-Audit</span>
                  <p className="text-xs font-semibold text-amber-700 leading-relaxed">
                    <span className="font-semibold">Hospital rebuttal:</span> {selectedClaim.contest_note || selectedClaim.audit_summary?.contest?.hospital_note || "No rebuttal note provided."}
                  </p>
                  <p className="text-sm font-semibold text-amber-800 font-mono">
                    Amount under contest: {money(Number(selectedClaim.under_contest_amount || selectedClaim.audit_summary?.contest?.amount_under_contest || 0))}
                  </p>
                  {Array.isArray(selectedClaim.contest_documents) && selectedClaim.contest_documents.length > 0 && (
                    <div className="space-y-1.5 border-t border-amber-200 pt-2.5">
                      <p className="text-xs font-semibold text-amber-700">Hospital Uploaded Documents</p>
                      {selectedClaim.contest_documents.map((doc: any, index: number) => (
                        <a
                          key={`${doc.name || "document"}-${index}`}
                          href={doc.data_url || undefined}
                          download={doc.name || `contest-document-${index + 1}`}
                          className="block rounded-lg bg-white/70 px-3 py-2 text-xs font-bold text-amber-900 underline-offset-2 hover:underline"
                        >
                          {doc.name || `Document ${index + 1}`} {doc.size ? `(${Math.round(Number(doc.size) / 1024)} KB)` : ""}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Standard HMO Claims Visual Timeline */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-xs font-semibold text-slate-600 mb-3">Audit Lifecycle Journey</p>
                <div className="space-y-3 relative before:absolute before:bottom-2 before:top-2 before:left-[5px] before:w-[1.5px] before:bg-slate-200">
                  <div className="flex items-start gap-3 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0 z-10" />
                    <div>
                      <p className="font-semibold text-slate-800">Claim Generated & Submitted</p>
                      <p className="text-xs text-slate-400 mt-0.5">Logged successfully by the hospital portal.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-xs">
                    <span className={cn(
                      "w-2.5 h-2.5 rounded-full mt-1 shrink-0 z-10",
                      selectedClaim.status === "submitted" ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                    )} />
                    <div>
                      <p className="font-semibold text-slate-800">Compliance Verification</p>
                      <p className="text-xs text-slate-400 mt-0.5">Database matches enrollment check & clinical limits.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-xs">
                    <span className={cn(
                      "w-2.5 h-2.5 rounded-full mt-1 shrink-0 z-10",
                      ["approved", "partially_approved", "rejected", "paid"].includes(selectedClaim.status) ? "bg-emerald-500" : "bg-slate-300"
                    )} />
                    <div>
                      <p className="font-semibold text-slate-800">Clinical & Price Audit</p>
                      <p className="text-xs text-slate-400 mt-0.5">Reviewer cross-checks line items & approves payout.</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Right Column: Interactive Audit Ledger & Decisions */}
            <div className="space-y-4 md:col-span-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Itemized Claims Ledger</span>
                  <span className="text-xs font-semibold text-slate-400">{verificationData.approvedItems.length} items</span>
                </div>

                {/* Interactive Item Cards */}
                {verificationData.approvedItems.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {verificationData.approvedItems.map((item: any, idx: number) => {
                      const codeOrName = itemKey(item, idx);
                      const isPreDeclined = !!item.declined;
                      const decision = auditDecisions[codeOrName] || { 
                        status: isPreDeclined ? "declined" : "approved",
                        reason: isPreDeclined ? (item.decline_reason || "Declined during pre-authorization") : undefined,
                        reasonCategory: isPreDeclined ? "PRE_AUTH_DECLINED" : undefined
                      };
                      const isDeclined = decision.status === "declined" || isPreDeclined;
                      const unitPrice = isPreDeclined ? 0 : Number(decision.approvedUnitPrice ?? itemUnit(item));
                      const qty = isPreDeclined ? 0 : Number(decision.approvedQuantity ?? itemQty(item));
                      const originalQty = itemQty(item);
                      const originalSubtotal = itemUnit(item) * originalQty;
                      const subtotal = isDeclined ? 0 : unitPrice * qty;
                      const isAuditing = !isPreDeclined && (selectedClaim.status === "submitted" || selectedClaim.status === "pending" || selectedClaim.status === "contested" || selectedClaim.status === "under_contest");
                      
                      // Check for unit price discrepancy against reference list
                      const isBilledOverCap = !isPreDeclined && (itemUnit(item) > unitPrice);

                      return (
                        <div 
                          key={idx} 
                          className={cn(
                            "p-3 rounded-xl border transition-all duration-200 text-xs",
                            isDeclined 
                              ? "bg-slate-50/60 border-slate-200 opacity-60 text-slate-400 shadow-none" 
                              : "bg-white border-slate-100 shadow-sm text-slate-800"
                          )}
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className={cn("text-xs font-semibold text-slate-900 leading-tight", isDeclined && "line-through text-slate-400")}>{item.name}</p>
                                {isBilledOverCap && !isDeclined && (
                                  <Badge className="border-none text-xs font-semibold bg-rose-500/10 text-rose-600 px-1 py-0.5 rounded leading-none">
                                    Over-Cap Billed
                                  </Badge>
                                )}
                                {isPreDeclined && (
                                  <Badge className="border-none text-xs font-semibold bg-rose-500/10 text-rose-600 px-1 py-0.5 rounded leading-none">
                                    Pre-Auth Declined
                                  </Badge>
                                )}
                              </div>
                              {item.code && <p className="text-xs font-mono font-bold text-blue-500 mt-1">Code: {item.code}</p>}
                              <p className="text-xs font-semibold text-slate-500 mt-1">
                                {isPreDeclined ? "Declined by Utilization Manager during Pre-Auth" : `Approved: ${qty} of ${originalQty} unit${originalQty > 1 ? 's' : ''}`}
                              </p>
                              {decision.reasonCategory && !isPreDeclined && <p className="mt-1.5 text-xs font-semibold leading-snug text-rose-650">Category: {decision.reasonCategory}</p>}
                              {decision.reason && !isPreDeclined && <p className={cn("mt-1 text-xs font-semibold leading-snug", isDeclined ? "text-rose-600" : "text-amber-600")}>Reason: {decision.reason}</p>}
                              {isPreDeclined && (
                                <p className="mt-1 text-xs font-semibold leading-snug text-rose-600 bg-rose-50/50 p-1.5 rounded border border-rose-100/30">
                                  <span className="font-bold">Reason:</span> {item.decline_reason || "Declined during pre-authorization review"}
                                </p>
                              )}
                              {decision.note && !isPreDeclined && <p className="mt-1 text-xs font-semibold leading-snug text-emerald-600">Note: {decision.note}</p>}
                              {decision.aiExplanation && !isPreDeclined && <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">Hospital note: {decision.aiExplanation}</p>}
                              {!isPreDeclined && <p className="text-xs font-semibold text-slate-500 mt-1.5">{qty} unit{qty > 1 ? 's' : ''} × {money(unitPrice)}</p>}
                            </div>
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <div className="text-right">
                                {subtotal !== originalSubtotal && <span className="block font-mono text-xs font-medium text-slate-300 line-through">{money(originalSubtotal)}</span>}
                                <span className={cn("font-semibold font-mono text-sm", isDeclined ? "line-through text-slate-400" : "text-emerald-700")}>
                                  {money(subtotal)}
                                </span>
                              </div>
                              {isAuditing && (
                                <div className="flex flex-col items-end gap-1.5">
                                  <button
                                    onClick={() => isDeclined ? openApprovalDialog(codeOrName, item) : openDeclineDialog(codeOrName, item)}
                                    className={cn(
                                      "text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all duration-150 active:scale-95",
                                      isDeclined
                                        ? "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100"
                                        : "bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100"
                                    )}
                                  >
                                    {isDeclined ? "Approve Item" : "Decline Item"}
                                  </button>
                                  {!isDeclined && (
                                    <button
                                      onClick={() => adjustItemQuantity(codeOrName, item)}
                                      className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100 transition-all duration-150 active:scale-95"
                                    >
                                      Adjust Qty
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">No clinical items match the verification record</p>
                  </div>
                )}
              </div>

              {/* Pricing Audit Reconciliation summary */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block">Total Claim Value</span>
                    <span className="text-sm font-semibold text-slate-600 font-mono mt-1 block">{money(selectedClaim.total_amount)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-slate-500 block">Audited Approved Value</span>
                    <span className={cn("font-semibold text-lg font-mono mt-1 block", calculatedApprovedAmount < Number(selectedClaim.total_amount) ? "text-amber-600 animate-pulse" : "text-emerald-700")}>
                      {money(calculatedApprovedAmount)}
                    </span>
                  </div>
                </div>

                {/* Warning info if amount was modified */}
                {(auditSummary.declined > 0 || auditSummary.declinedCount > 0) && (
                  <div className="bg-amber-500/5 border border-amber-100 p-3 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold text-amber-700 leading-relaxed">
                      Audit savings: {auditSummary.declinedCount} item(s) declined/adjusted. Approved value reduced by <span className="font-mono font-semibold">{money(auditSummary.declined)}</span>.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-emerald-55 p-3 border border-emerald-100">
                    <p className="text-xs font-semibold text-emerald-700">Approved Items</p>
                    <p className="font-mono text-xl font-bold text-emerald-700 mt-1">{auditSummary.approvedCount}</p>
                  </div>
                  <div className="rounded-xl bg-rose-55 p-3 border border-rose-100">
                    <p className="text-xs font-semibold text-rose-700">Declined Items</p>
                    <p className="font-mono text-xl font-bold text-rose-700 mt-1">{auditSummary.declinedCount}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                    <p className="text-xs font-semibold text-slate-500">Final Status</p>
                    <p className="font-mono text-xs font-semibold text-slate-900 mt-1">{auditSummary.finalStatus.replace("_", " ")}</p>
                  </div>
                </div>

                {/* Finalize Auditing Action Controls */}
                {(role === "claims" || role === "admin") && (selectedClaim.status === "submitted" || selectedClaim.status === "pending" || selectedClaim.status === "contested" || selectedClaim.status === "under_contest") ? (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button 
                      onClick={() => {
                        const approvedItemDetails = verificationData.approvedItems
                          .filter((item: any) => !declinedItemCodes.includes(itemKey(item)))
                          .map((item: any) => `${item.name} (${item.quantity} unit${item.quantity > 1 ? 's' : ''} × ${money(item.unit_price ?? item.price ?? item.amount ?? 0)})`);

                        const declinedItemDetails = verificationData.approvedItems
                          .filter((item: any) => declinedItemCodes.includes(itemKey(item)))
                          .map((item: any) => `${item.name} (${item.quantity} unit${item.quantity > 1 ? 's' : ''} × ${money(item.unit_price ?? item.price ?? item.amount ?? 0)})`);

                        const aiAuditNote = `[AUTOMATED CLINICAL AUDIT COMPLETED]
Claim Reference: ${selectedClaim.claim_number}
Status: Approved with Adjustments

APPROVED ITEMS:
${approvedItemDetails.length > 0 ? approvedItemDetails.map(n => `• ${n}`).join("\n") : "None"}

DECLINED ITEMS (EXCLUDED FROM PAYOUT):
${declinedItemDetails.length > 0 ? declinedItemDetails.map(n => `• ${n} - Clinical Audit Exception`).join("\n") : "None"}

SUMMARY OF ADJUSTMENTS:
- Requested Amount: ${money(selectedClaim.total_amount)}
- Approved Payout: ${money(calculatedApprovedAmount)}
- Deducted Penalty: ${money(Number(selectedClaim.total_amount) - calculatedApprovedAmount)}

Audit completed automatically. Under active clinical policy review. Hospital may submit a contest to appeal items declined during this audit.`;

                        handleStatusUpdate(selectedClaim.id, "approved", calculatedApprovedAmount, aiAuditNote);
                        setIsMobileDetailOpen(false);
                      }}
                      disabled={!verificationData.exists || verificationData.mismatchReasons.length > 0}
                      className="bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold h-12 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-sm"
                    >
                      Approve Claim
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        const rejectedAuditNote = `[AUTOMATED CLINICAL AUDIT COMPLETED]
Claim Reference: ${selectedClaim.claim_number}
Status: Rejected

Reason: The claims auditing panel has rejected this claim in its entirety. Direct clinical audit mismatches or forgery warning flags detected. Payout suspended.`;

                        handleStatusUpdate(selectedClaim.id, "rejected", 0, rejectedAuditNote);
                        setIsMobileDetailOpen(false);
                      }}
                      className="border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold h-12 rounded-xl"
                    >
                      Reject Claim
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-slate-650 text-center py-4 bg-slate-50 rounded-xl border border-slate-100">
                    Claim has been finalized as <span className="text-slate-900 font-semibold">{(selectedClaim.status || "").replace("_", " ")}</span>
                  </p>
                )}
              </div>

            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
