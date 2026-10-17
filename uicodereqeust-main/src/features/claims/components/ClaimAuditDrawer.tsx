import React, { useState } from "react";
import { 
  Loader2, 
  Copy, 
  Building2, 
  XCircle, 
  AlertCircle, 
  CheckCircle2,
  X,
  ShieldCheck,
  Check,
  AlertTriangle,
  FileText,
  Clock,
  ArrowRight
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormattedAuditNote } from "@/components/ui/FormattedAuditNote";
import { cn } from "@/lib/utils";
import { ClaimDraft, AuditDecision, money, splitClaimNotes } from "@/lib/claims-helpers";
import { formatNigeriaDate, formatNigeriaDateTime } from "@/lib/authorizationTime";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

const STATUS_PILL_STYLES: Record<string, string> = {
  approved: "bg-emerald-600 text-white border-transparent font-bold",
  partially_approved: "bg-sky-600 text-white border-transparent font-bold",
  paid: "bg-purple-600 text-white border-transparent font-bold",
  rejected: "bg-rose-600 text-white border-transparent font-bold",
  contested: "bg-orange-600 text-white border-transparent font-bold",
  under_contest: "bg-orange-600 text-white border-transparent font-bold",
  submitted: "bg-amber-500 text-white border-transparent font-bold",
  pending: "bg-amber-500 text-white border-transparent font-bold",
  under_review: "bg-blue-600 text-white border-transparent font-bold",
};

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
  const { toast } = useToast();
  const [isReleasing, setIsReleasing] = useState(false);

  if (!selectedClaim) return null;

  const itemKey = (item: any, index?: number) => String(item.code || item.name || index || "item");
  const itemUnit = (item: any) => Number(item.unit_price ?? item.price ?? 0);
  const itemQty = (item: any) => Math.max(1, Number(item.quantity ?? 1));

  const isAuditable = 
    (role === "claims" || role === "admin") &&
    (selectedClaim.status === "submitted" || 
     selectedClaim.status === "pending" || 
     selectedClaim.status === "contested" || 
     selectedClaim.status === "under_contest");

  const statusKey = String(selectedClaim.status || "pending").toLowerCase();
  const statusBadgeStyle = STATUS_PILL_STYLES[statusKey] || "border-slate-200 text-slate-700 bg-slate-50";

  let statusLabel = (selectedClaim.status || "Pending").replace(/_/g, " ");
  if (statusKey === "submitted") statusLabel = "Pending";
  else if (statusKey === "partially_approved") statusLabel = "Partially Approved";
  else if (statusKey === "under_contest") statusLabel = "Contested";

  const contestDaysRemaining = selectedClaim.contest_deadline
    ? Math.max(0, Math.ceil((new Date(selectedClaim.contest_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const handleReleaseToPayment = async () => {
    setIsReleasing(true);
    try {
      const { error } = await supabase.rpc("release_claim_to_payment" as any, {
        p_claim_id: selectedClaim.id
      });
      if (error) throw error;
      toast({
        title: "Released to Payment",
        description: "Claim has been moved directly to the awaiting payment queue.",
      });
      selectedClaim.payment_status = "awaiting_payment";
      setIsMobileDetailOpen(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Action Failed", description: err.message });
    } finally {
      setIsReleasing(false);
    }
  };

  return (
    <Dialog open={isMobileDetailOpen} onOpenChange={setIsMobileDetailOpen}>
      <DialogContent 
        className="w-[calc(100vw_-_1rem)] max-w-[calc(100vw_-_1rem)] max-h-[calc(100dvh_-_1rem)] rounded-xl border border-slate-200 bg-white p-0 shadow-2xl overflow-hidden min-w-0 sm:w-[94vw] sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl sm:max-h-[92dvh] sm:rounded-2xl flex flex-col [&>button.absolute.right-4]:hidden z-50"
      >
        {/* Sticky Header */}
        <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">
                  Claims Audit Review
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-[10px] font-medium text-slate-500">
                  {formatNigeriaDateTime(selectedClaim.created_at)}
                </span>
              </div>
              
              <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-slate-900 mt-1 truncate">
                {selectedClaim.patient_name || "Unknown Patient"}
              </h2>

              <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-slate-600">
                <span className="flex items-center gap-1 font-mono font-medium">
                  Ref: <span className="font-semibold text-slate-800">{selectedClaim.claim_number}</span>
                  <button
                    onClick={() => copyToClipboard(selectedClaim.claim_number, "Claim Ref")}
                    className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
                    title="Copy Claim Reference"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </span>

                <span className="text-slate-300">·</span>

                <span className="flex items-center gap-1 font-mono font-medium">
                  Policy: <span className="font-semibold text-slate-800">{selectedClaim.policy_number}</span>
                  <button
                    onClick={() => copyToClipboard(selectedClaim.policy_number, "Policy Number")}
                    className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
                    title="Copy Policy Number"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </span>

                <span className="text-slate-300">·</span>

                <span className="flex items-center gap-1 font-mono font-medium text-indigo-700">
                  Auth: <span className="font-bold">{selectedClaim.auth_code}</span>
                  <button
                    onClick={() => copyToClipboard(selectedClaim.auth_code, "Auth Code")}
                    className="text-indigo-400 hover:text-indigo-700 transition-colors p-0.5"
                    title="Copy Auth Code"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </span>

                <span className="text-slate-300">·</span>

                <span className="flex items-center gap-1 truncate max-w-[200px]" title={selectedClaim.hospital_name}>
                  <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                  <span className="truncate">{selectedClaim.hospital_name}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <Badge
                variant="outline"
                className={cn(
                  "inline-flex items-center justify-center w-[124px] h-[26px] whitespace-nowrap rounded-full px-2 text-[11px] font-semibold tracking-tight shadow-none border capitalize",
                  statusBadgeStyle
                )}
              >
                {statusLabel}
              </Badge>

              <button
                onClick={() => setIsMobileDetailOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="grid gap-6 lg:grid-cols-12 items-start">
            
            {/* Left column: Verification, clinical context & notes */}
            <div className="space-y-4 lg:col-span-6">
              
              {/* Compliance & Verification Guardrails */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span>Audit Compliance Guardrails</span>
                  </div>
                  <Badge variant="outline" className="border-slate-200 text-slate-500 text-[10px] font-medium px-2 py-0.5">
                    HMO Clinical Protocol
                  </Badge>
                </div>

                <div className="grid gap-2 text-xs">
                  {/* Check 1: Patient Identity */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        verificationData.mismatchReasons.some(r => r.includes("Patient Name")) ? "bg-rose-500" : "bg-emerald-500"
                      )} />
                      <span className="font-medium text-slate-700">Patient Identity Match</span>
                    </div>
                    <span className={cn(
                      "font-semibold text-xs",
                      verificationData.mismatchReasons.some(r => r.includes("Patient Name")) ? "text-rose-600" : "text-emerald-700"
                    )}>
                      {verificationData.mismatchReasons.some(r => r.includes("Patient Name")) ? "MISMATCH" : "VERIFIED"}
                    </span>
                  </div>

                  {/* Check 2: Enrollment ID */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        verificationData.mismatchReasons.some(r => r.includes("Enrollment ID")) ? "bg-rose-500" : "bg-emerald-500"
                      )} />
                      <span className="font-medium text-slate-700">Policy Enrollment Check</span>
                    </div>
                    <span className={cn(
                      "font-semibold text-xs",
                      verificationData.mismatchReasons.some(r => r.includes("Enrollment ID")) ? "text-rose-600" : "text-emerald-700"
                    )}>
                      {verificationData.mismatchReasons.some(r => r.includes("Enrollment ID")) ? "MISMATCH" : "VERIFIED"}
                    </span>
                  </div>

                  {/* Check 3: Facility Authorization */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        verificationData.mismatchReasons.some(r => r.includes("ownership")) ? "bg-amber-500" : "bg-emerald-500"
                      )} />
                      <span className="font-medium text-slate-700">Facility Authorization Match</span>
                    </div>
                    <span className={cn(
                      "font-semibold text-xs",
                      verificationData.mismatchReasons.some(r => r.includes("ownership")) ? "text-amber-600" : "text-emerald-700"
                    )}>
                      {verificationData.mismatchReasons.some(r => r.includes("ownership")) ? "ATTENTION" : "AUTHORIZED"}
                    </span>
                  </div>

                  {/* Check 4: Pre-authorization Validity */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        !verificationData.exists ? "bg-rose-500" : "bg-emerald-500"
                      )} />
                      <span className="font-medium text-slate-700">Clinical Pre-Authorization</span>
                    </div>
                    <span className={cn(
                      "font-semibold text-xs",
                      !verificationData.exists ? "text-rose-600" : "text-emerald-700"
                    )}>
                      {!verificationData.exists ? "NOT FOUND" : "RECORD MATCHED"}
                    </span>
                  </div>
                </div>

                {/* Validation Status Feedback */}
                {verificationData.loading ? (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center gap-2 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    <span className="text-xs font-medium text-slate-500">Cross-verifying pre-authorization records...</span>
                  </div>
                ) : !verificationData.exists ? (
                  <div className="bg-rose-50/70 border border-rose-200 p-3 rounded-lg space-y-1">
                    <div className="flex items-center gap-2 text-rose-700">
                      <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span className="text-xs font-semibold">Pre-Authorization Record Missing</span>
                    </div>
                    <p className="text-xs text-rose-600 leading-relaxed">
                      No clinical authorization record matching code <span className="font-mono font-bold text-rose-800">'{selectedClaim.auth_code}'</span> was found in the database.
                    </p>
                  </div>
                ) : verificationData.mismatchReasons.length > 0 ? (
                  <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-lg space-y-1.5">
                    <div className="flex items-center gap-2 text-amber-800">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span className="text-xs font-semibold">Discrepancy Detected</span>
                    </div>
                    <ul className="list-disc list-inside text-xs text-amber-800 space-y-0.5 leading-relaxed">
                      {verificationData.mismatchReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-amber-700 mt-1">Manual audit review required prior to payout approval.</p>
                  </div>
                ) : (
                  <div className="bg-emerald-50/60 border border-emerald-200 p-3 rounded-lg flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span className="text-xs font-medium">
                      Claim perfectly matches authorized Pre-Auth Record <span className="font-mono font-bold">#{verificationData.authRequest?.request_id || selectedClaim.auth_code}</span>.
                    </span>
                  </div>
                )}
              </div>

              {/* Clinical Context & Facility */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
                    Clinical Diagnosis
                  </span>
                  <p className="text-xs font-semibold text-slate-900 mt-1 leading-snug">
                    {verificationData.authRequest?.diagnosis || selectedClaim.diagnosis || "Not Specified"}
                  </p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">
                    Requesting Facility
                  </span>
                  <p className="text-xs font-semibold text-slate-900 mt-1 leading-snug truncate" title={selectedClaim.hospital_name}>
                    {selectedClaim.hospital_name}
                  </p>
                  <p className="text-[11px] font-medium text-emerald-700 mt-0.5 flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" /> Em験elled Provider
                  </p>
                </div>
              </div>

              {/* Clinical Notes & Audit logs */}
              {selectedClaim.notes && (() => {
                const noteSections = splitClaimNotes(selectedClaim.notes);
                const hasClinical = noteSections.clinical && noteSections.clinical.trim().length > 0;
                const hasAudit = noteSections.audit && noteSections.audit.trim().length > 0;
                if (!hasClinical && !hasAudit) return null;
                return (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-500 block">
                      Clinical Notes & Audit Logs
                    </span>
                    <div className="grid gap-2">
                      {hasClinical && (
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <FormattedAuditNote text={noteSections.clinical} />
                        </div>
                      )}
                      {hasAudit && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-sm">
                          <FormattedAuditNote text={noteSections.audit} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Contest Section */}
              {(selectedClaim.status === "contested" || selectedClaim.status === "under_contest") && (
                <div className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <span className="text-xs font-bold text-amber-800 block">Contest Awaiting Re-Audit</span>
                  <p className="text-xs text-slate-800 leading-relaxed">
                    <span className="font-semibold text-amber-900">Hospital Rebuttal:</span> {selectedClaim.contest_note || selectedClaim.audit_summary?.contest?.hospital_note || "No rebuttal note provided."}
                  </p>
                  <p className="text-xs font-bold text-amber-900 font-mono">
                    Amount Under Contest: {money(Number(selectedClaim.under_contest_amount || selectedClaim.audit_summary?.contest?.amount_under_contest || 0))}
                  </p>
                  {Array.isArray(selectedClaim.contest_documents) && selectedClaim.contest_documents.length > 0 && (
                    <div className="space-y-1.5 border-t border-amber-200 pt-2.5">
                      <p className="text-[11px] font-semibold text-amber-800">Hospital Supporting Documents</p>
                      {selectedClaim.contest_documents.map((doc: any, index: number) => (
                        <a
                          key={`${doc.name || "document"}-${index}`}
                          href={doc.data_url || undefined}
                          download={doc.name || `contest-document-${index + 1}`}
                          className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-amber-900 border border-amber-200 hover:bg-white transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="truncate flex-1">{doc.name || `Document ${index + 1}`}</span>
                          {doc.size && <span className="text-[10px] text-slate-500 shrink-0">({Math.round(Number(doc.size) / 1024)} KB)</span>}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Audit Lifecycle Stepper */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                <p className="text-xs font-semibold text-slate-600 mb-2.5">Audit Lifecycle Journey</p>
                <div className="space-y-2.5 relative before:absolute before:bottom-2 before:top-2 before:left-[5px] before:w-[1.5px] before:bg-slate-200">
                  <div className="flex items-start gap-3 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0 z-10" />
                    <div>
                      <p className="font-semibold text-slate-800">Claim Generated & Submitted</p>
                      <p className="text-[11px] text-slate-500">Logged successfully through hospital claims portal.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-xs">
                    <span className={cn(
                      "w-2.5 h-2.5 rounded-full mt-1 shrink-0 z-10",
                      selectedClaim.status === "submitted" ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                    )} />
                    <div>
                      <p className="font-semibold text-slate-800">Compliance & Pre-Auth Check</p>
                      <p className="text-[11px] text-slate-500">Matched against clinical authorization and policy limits.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 text-xs">
                    <span className={cn(
                      "w-2.5 h-2.5 rounded-full mt-1 shrink-0 z-10",
                      ["approved", "partially_approved", "rejected", "paid"].includes(selectedClaim.status) ? "bg-emerald-500" : "bg-slate-300"
                    )} />
                    <div>
                      <p className="font-semibold text-slate-800">Tariff & Pricing Audit</p>
                      <p className="text-[11px] text-slate-500">Line-item tariff adjustments and payout finalization.</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Right Column: Itemized Ledger, Pricing & Actions */}
            <div className="space-y-4 lg:col-span-6">
              
              {/* Itemized Claims Ledger */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Itemized Claims Ledger</span>
                  <Badge variant="outline" className="border-slate-200 text-slate-500 text-[10px] font-semibold px-2 py-0.5">
                    {verificationData.approvedItems.length} item{verificationData.approvedItems.length === 1 ? "" : "s"}
                  </Badge>
                </div>

                {verificationData.approvedItems.length > 0 ? (
                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
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
                      const isBilledOverCap = !isPreDeclined && (itemUnit(item) > unitPrice);

                      return (
                        <div 
                          key={idx} 
                          className={cn(
                            "p-3 rounded-xl border transition-all duration-150 text-xs",
                            isDeclined 
                              ? "bg-slate-50/70 border-slate-200 text-slate-400" 
                              : "bg-white border-slate-200 shadow-sm text-slate-800"
                          )}
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className={cn("text-xs font-semibold text-slate-900 leading-tight", isDeclined && "line-through text-slate-400")}>
                                  {item.name}
                                </p>
                                {isBilledOverCap && !isDeclined && (
                                  <Badge className="border-none text-[10px] font-semibold bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded leading-none">
                                    Over-Cap
                                  </Badge>
                                )}
                                {isPreDeclined && (
                                  <Badge className="border-none text-[10px] font-semibold bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded leading-none">
                                    Pre-Auth Declined
                                  </Badge>
                                )}
                              </div>

                              {item.code && (
                                <p className="text-[11px] font-mono font-medium text-slate-500 mt-0.5">Code: {item.code}</p>
                              )}

                              <p className="text-xs font-medium text-slate-500 mt-1">
                                {isPreDeclined 
                                  ? "Declined during Pre-Auth" 
                                  : `Payable: ${qty} of ${originalQty} unit${originalQty > 1 ? 's' : ''} × ${money(unitPrice)}`
                                }
                              </p>

                              {decision.reasonCategory && !isPreDeclined && (
                                <p className="mt-1 text-[11px] font-semibold text-rose-600">Category: {decision.reasonCategory}</p>
                              )}
                              {decision.reason && !isPreDeclined && (
                                <p className={cn("mt-0.5 text-[11px] font-medium", isDeclined ? "text-rose-600" : "text-amber-600")}>
                                  Reason: {decision.reason}
                                </p>
                              )}
                              {isPreDeclined && (
                                <p className="mt-1 text-[11px] font-medium text-rose-600 bg-rose-50/60 p-1.5 rounded border border-rose-100">
                                  <span className="font-semibold">Reason:</span> {item.decline_reason || "Declined during pre-authorization review"}
                                </p>
                              )}
                              {decision.note && !isPreDeclined && (
                                <p className="mt-0.5 text-[11px] font-medium text-emerald-700">Note: {decision.note}</p>
                              )}
                            </div>

                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <div className="text-right">
                                {subtotal !== originalSubtotal && (
                                  <span className="block font-mono text-[11px] text-slate-400 line-through">
                                    {money(originalSubtotal)}
                                  </span>
                                )}
                                <span className={cn("font-bold font-mono text-xs", isDeclined ? "line-through text-slate-400" : "text-emerald-700")}>
                                  {money(subtotal)}
                                </span>
                              </div>

                              {isAuditable && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => isDeclined ? openApprovalDialog(codeOrName, item) : openDeclineDialog(codeOrName, item)}
                                    className={cn(
                                      "h-7 px-2 text-[11px] font-semibold rounded-lg",
                                      isDeclined 
                                        ? "text-emerald-700 border-emerald-200 hover:bg-emerald-50" 
                                        : "text-rose-700 border-rose-200 hover:bg-rose-50"
                                    )}
                                  >
                                    {isDeclined ? "Restore" : "Decline"}
                                  </Button>
                                  
                                  {!isDeclined && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => adjustItemQuantity(codeOrName, item)}
                                      className="h-7 px-2 text-[11px] font-semibold text-slate-700 border-slate-200 hover:bg-slate-50 rounded-lg"
                                    >
                                      Adjust
                                    </Button>
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
                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 text-center">
                    <p className="text-xs font-medium text-slate-400">No itemized lines recorded for this claim.</p>
                  </div>
                )}
              </div>

              {/* Pricing Audit Reconciliation */}
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">Total Claimed</span>
                    <span className="text-sm font-bold text-slate-800 font-mono mt-0.5 block">{money(selectedClaim.total_amount)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">Audited Payable</span>
                    <span className={cn(
                      "font-bold text-base font-mono mt-0.5 block", 
                      calculatedApprovedAmount < Number(selectedClaim.total_amount) ? "text-amber-700" : "text-emerald-700"
                    )}>
                      {money(calculatedApprovedAmount)}
                    </span>
                  </div>
                </div>

                {(auditSummary.declined > 0 || auditSummary.declinedCount > 0) && (
                  <div className="bg-amber-50/70 border border-amber-200 p-2.5 rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-800 font-medium">
                      Audit adjustment: {auditSummary.declinedCount} item(s) modified. Reduced by <span className="font-mono font-bold">{money(auditSummary.declined)}</span>.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <p className="text-[11px] font-semibold text-emerald-700">Approved Items</p>
                    <p className="font-mono text-lg font-bold text-slate-800 mt-0.5">{auditSummary.approvedCount}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <p className="text-[11px] font-semibold text-rose-700">Declined Items</p>
                    <p className="font-mono text-lg font-bold text-slate-800 mt-0.5">{auditSummary.declinedCount}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-500">Decision Status</p>
                    <p className="font-mono text-xs font-bold text-slate-900 mt-1 capitalize">{auditSummary.finalStatus.replace(/_/g, " ")}</p>
                  </div>
                </div>

                {/* Audit Action Controls */}
                {isAuditable ? (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <Button 
                      onClick={() => {
                        const approvedItemDetails = verificationData.approvedItems
                          .filter((item: any) => !declinedItemCodes.includes(itemKey(item)))
                          .map((item: any) => `${item.name} (${item.quantity} unit${item.quantity > 1 ? 's' : ''} × ${money(item.unit_price ?? item.price ?? item.amount ?? 0)})`);

                        const declinedItemDetails = verificationData.approvedItems
                          .filter((item: any) => declinedItemCodes.includes(itemKey(item)))
                          .map((item: any) => `${item.name} (${item.quantity} unit${item.quantity > 1 ? 's' : ''} × ${money(item.unit_price ?? item.price ?? item.amount ?? 0)})`);

                        const aiAuditNote = `[CLINICAL AUDIT COMPLETED]
Claim Reference: ${selectedClaim.claim_number}
Status: Approved with Adjustments

APPROVED ITEMS:
${approvedItemDetails.length > 0 ? approvedItemDetails.map(n => `• ${n}`).join("\n") : "None"}

DECLINED ITEMS:
${declinedItemDetails.length > 0 ? declinedItemDetails.map(n => `• ${n} - Clinical Audit Exception`).join("\n") : "None"}

SUMMARY:
- Requested: ${money(selectedClaim.total_amount)}
- Approved: ${money(calculatedApprovedAmount)}
- Deductions: ${money(Number(selectedClaim.total_amount) - calculatedApprovedAmount)}

Audit completed. Hospital may submit a contest to appeal items declined during this audit.`;

                        handleStatusUpdate(selectedClaim.id, "approved", calculatedApprovedAmount, aiAuditNote);
                        setIsMobileDetailOpen(false);
                      }}
                      disabled={!verificationData.exists || verificationData.mismatchReasons.length > 0}
                      className="bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold h-11 rounded-xl text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Approve Payout ({money(calculatedApprovedAmount)})
                    </Button>

                    <Button 
                      variant="outline" 
                      onClick={() => {
                        const rejectedAuditNote = `[CLINICAL AUDIT COMPLETED]
Claim Reference: ${selectedClaim.claim_number}
Status: Rejected

Reason: The claims auditing panel has rejected this claim in its entirety. Direct clinical audit mismatches or forgery warning flags detected. Payout suspended.`;

                        handleStatusUpdate(selectedClaim.id, "rejected", 0, rejectedAuditNote);
                        setIsMobileDetailOpen(false);
                      }}
                      className="border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold h-11 rounded-xl"
                    >
                      Reject Claim
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">
                        Final Status: <span className="text-slate-900 font-bold capitalize">{statusLabel}</span>
                      </span>
                      {selectedClaim.payment_status === "awaiting_payment" ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-none text-[10px] font-bold">
                          ✓ In Payment Queue
                        </Badge>
                      ) : selectedClaim.status === "partially_approved" ? (
                        <Badge className="bg-amber-100 text-amber-800 border-none text-[10px] font-bold">
                          {contestDaysRemaining > 0 ? `${contestDaysRemaining}d Dispute Window` : "Dispute Expired"}
                        </Badge>
                      ) : null}
                    </div>

                    {selectedClaim.status === "partially_approved" && (
                      selectedClaim.payment_status === "awaiting_payment" ? (
                        <p className="text-xs text-emerald-700 font-medium leading-relaxed">
                          This claim has been released to the payment queue and is ready for settlement batching.
                        </p>
                      ) : (
                        <div className="space-y-2.5 pt-1.5 border-t border-slate-200">
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {contestDaysRemaining > 0
                              ? `Waiting for the hospital's 7-day dispute window (${contestDaysRemaining} days remaining until ${formatNigeriaDate(selectedClaim.contest_deadline)}).`
                              : "The 7-day contest dispute window has passed. Claim qualifies for payment settlement."}
                          </p>
                          {(role === "claims" || role === "admin" || role === "finance") && (
                            <Button
                              onClick={handleReleaseToPayment}
                              disabled={isReleasing}
                              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold h-10 rounded-xl transition-all shadow-sm"
                            >
                              {isReleasing ? "Releasing to Payment..." : "Release to Payment Queue Now"}
                            </Button>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

            </div>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
