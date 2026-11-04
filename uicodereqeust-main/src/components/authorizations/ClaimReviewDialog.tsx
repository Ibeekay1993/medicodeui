import { FileText, Loader2, CheckCircle2, EyeOff, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getApprovedItems,
  claimOwnerNameFor,
  isReferralFor,
  isReferringHospitalFor,
  canSubmitClaimFor,
  isClaimLockedAfterTransfer,
  isFrozenAuthorization,
  isClaimEligible,
  displayStatus,
  claimStatusClass,
  rejectionReason,
  isRejected
} from "@/lib/authorizations-helpers";

interface ClaimReviewDialogProps {
  isReviewing: boolean;
  setIsReviewing: (open: boolean) => void;
  selectedRequest: any;
  hospital: any;
  claimStatusFor: (request: any) => string | undefined;
  isSubmitting: boolean;
  handleClaimSubmit: () => void;
  otpVerifiedStatus?: Record<string, boolean>;
}

export default function ClaimReviewDialog({
  isReviewing,
  setIsReviewing,
  selectedRequest,
  hospital,
  claimStatusFor,
  isSubmitting,
  handleClaimSubmit,
  otpVerifiedStatus = {}
}: ClaimReviewDialogProps) {
  const claimStatus = selectedRequest ? claimStatusFor(selectedRequest) : undefined;
  const isReferred = selectedRequest ? isReferralFor(selectedRequest) : false;
  const isReferring = (selectedRequest && hospital) ? isReferringHospitalFor(selectedRequest, hospital) : false;
  const canSubmit = (selectedRequest && hospital) ? canSubmitClaimFor(selectedRequest, hospital) : false;
  const isLocked = (selectedRequest && hospital) ? isClaimLockedAfterTransfer(selectedRequest, hospital) : false;
  const isFrozen = selectedRequest ? isFrozenAuthorization(selectedRequest) : false;
  const isEligible = (selectedRequest && hospital) ? isClaimEligible(selectedRequest, hospital) : false;
  const isClaimRejected = selectedRequest ? isRejected(selectedRequest) : false;

  const reqStatus = String(selectedRequest?.status || "").toLowerCase();
  const isApprovedReq = reqStatus.includes("approved") || reqStatus.includes("accepted");
  const isCodeLocked = isApprovedReq && !selectedRequest?.is_unlocked && !otpVerifiedStatus[selectedRequest?.id];

  const approvedItems = selectedRequest ? getApprovedItems(selectedRequest) : [];

  return (
    <Dialog open={isReviewing} onOpenChange={setIsReviewing}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-xl">
        {/* Clean, compact header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-5">
          <div className="min-w-0 pr-8">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Authorization &amp; Claim Review
              </h2>
              {selectedRequest?.status && (
                <Badge
                  className={cn(
                    "text-[10px] font-bold px-2.5 py-0.5 rounded-full capitalize shrink-0 border border-transparent shadow-none",
                    (() => {
                      const s = String(selectedRequest.status || "").toLowerCase();
                      const map: Record<string, string> = {
                        approved: "bg-emerald-600 text-white",
                        partially_approved: "bg-sky-600 text-white",
                        referral_approved: "bg-indigo-600 text-white",
                        referral_accepted: "bg-blue-600 text-white",
                        rejected: "bg-rose-600 text-white",
                        declined: "bg-rose-600 text-white",
                        pending: "bg-amber-500 text-white",
                      };
                      return map[s] || "bg-slate-600 text-white";
                    })()
                  )}
                >
                  {displayStatus(selectedRequest.status)}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Review pre-authorized treatments and submit claim to HMO
            </p>
          </div>
        </div>

        {/* Modal content body */}
        <div className="p-4 sm:p-5 space-y-3.5">
          {/* Patient Card */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {selectedRequest?.patient_name || "Patient Record"}
                </p>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                  Policy: {selectedRequest?.policy_number || "—"}
                </p>
              </div>
            </div>
            {selectedRequest?.urgency && (
              <Badge variant="outline" className="text-[10px] uppercase font-semibold text-slate-600 bg-white border-slate-200 shrink-0">
                {selectedRequest.urgency}
              </Badge>
            )}
          </div>

          {/* Referral Notice */}
          {isReferred && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-950 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-blue-900">Referral Notice</span>
                <span className="font-mono text-[10px] font-bold text-blue-700">Referred Case</span>
              </div>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                Origin: <span className="font-medium text-slate-900">{selectedRequest?.requesting_hospital_name || selectedRequest?.hospital_name || "Original facility"}</span> · Treating: <span className="font-medium text-slate-900">{claimOwnerNameFor(selectedRequest) || "Assigned facility"}</span>
              </p>
              {!canSubmit && (
                <p className="text-[11px] text-blue-700 italic pt-0.5">
                  This authorization is visible for clinical coordination only. Claims submission is restricted to the treating hospital.
                </p>
              )}
            </div>
          )}

          {/* Auth Code & Financial Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-medium text-slate-500">Authorization Code</p>
              <p
                className={cn(
                  "text-xs font-mono font-bold mt-1 truncate",
                  selectedRequest?.deletion_status === "awaiting_admin_approval"
                    ? "text-rose-600"
                    : isCodeLocked
                    ? "text-amber-800"
                    : "text-slate-900"
                )}
              >
                {selectedRequest?.deletion_status === "awaiting_admin_approval"
                  ? "WITHDRAWN (Pending Delete)"
                  : isCodeLocked
                  ? "🔒 Locked (Requires OTP Unlock)"
                  : selectedRequest?.authorization_code || "PENDING"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-medium text-slate-500">Authorized Value</p>
              {hospital && selectedRequest && isReferring ? (
                <p className="text-xs font-medium text-slate-400 mt-1 italic">Hidden (Referred)</p>
              ) : (
                <p className="text-xs font-mono font-bold text-emerald-700 mt-1">
                  &#8358;{Number(selectedRequest?.total_amount || 0).toLocaleString("en-NG")}
                </p>
              )}
            </div>
          </div>

          {/* Diagnosis & Itemized Treatments */}
          <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-3">
            <div>
              <p className="text-[11px] font-medium text-slate-500">Diagnosis</p>
              <p className="text-xs font-semibold text-slate-900 mt-0.5">
                {selectedRequest?.diagnosis || "Not specified"}
              </p>
            </div>

            {/* Pre-authorized treatment items — amounts hidden for referring hospital */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                  Authorized Items &amp; Tariff Breakdown
                  {isReferring && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                      <EyeOff className="h-2.5 w-2.5" />
                      View Only
                    </span>
                  )}
                </p>
                {!isReferring && (
                  <span className="text-[10px] text-slate-400 font-medium">NHIA Tariffs</span>
                )}
              </div>

              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {approvedItems.length > 0 ? (
                  approvedItems.map((item: any, idx: number) => {
                    const isDeclined = !!item.declined || item.status === "rejected";
                    const qty = Math.max(1, Number(item.quantity || item.qty || 1));
                    const unitPrice = Number(
                      item.unit_price || item.price || item.unitPrice || (item.amount ? Number(item.amount) / qty : 0)
                    );
                    const total = isDeclined ? 0 : Number(item.amount || item.total || qty * unitPrice || 0);

                    return (
                      <div
                        key={`${item.code || item.name || idx}`}
                        className={cn(
                          "flex flex-col gap-1 text-xs px-3 py-2 rounded-lg border",
                          isDeclined
                            ? "bg-rose-50/50 border-rose-100 text-rose-900"
                            : "bg-slate-50/70 border-slate-200/80 text-slate-800"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <FileText
                            className={cn(
                              "h-3.5 w-3.5 mt-0.5 shrink-0",
                              isDeclined ? "text-rose-400" : "text-slate-400"
                            )}
                          />
                          <span
                            className={cn(
                              "font-medium leading-tight flex-1",
                              isDeclined ? "line-through text-rose-700/80" : "text-slate-900"
                            )}
                          >
                            {item.code ? <span className="font-mono text-slate-500 mr-1">{item.code}</span> : null}
                            {item.name || item.item_name || "Approved item"}
                          </span>
                          {isDeclined && (
                            <Badge
                              variant="outline"
                              className="border-rose-200 bg-rose-50 text-[10px] font-semibold text-rose-700 px-1.5 py-0 h-4 shrink-0"
                            >
                              Declined
                            </Badge>
                          )}
                        </div>
                        {/* Quantity — always shown; unit price & total masked for referring hospital */}
                        <div className="pl-5.5 flex flex-wrap items-center justify-between gap-2 pt-0.5">
                          <span className="text-[11px] text-slate-500">
                            {qty} unit{qty === 1 ? "" : "s"}
                            {!isReferring && (
                              <> &times; &#8358;{unitPrice.toLocaleString("en-NG")}</>
                            )}
                          </span>
                          {!isReferring && (
                            <span
                              className={cn(
                                "font-mono font-semibold text-xs",
                                isDeclined ? "text-rose-600 line-through" : "text-slate-900"
                              )}
                            >
                              &#8358;{total.toLocaleString("en-NG")}
                            </span>
                          )}
                        </div>
                        {isDeclined && item.decline_reason && (
                          <div className="text-[11px] text-rose-700 font-medium bg-rose-100/40 rounded px-2 py-1 border border-rose-200/40 mt-0.5 pl-5">
                            <span className="font-semibold text-rose-800">Reason:</span> {item.decline_reason}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : selectedRequest?.treatment ? (
                  selectedRequest.treatment.split(/[;,]/).map((item: string, idx: number) => {
                    const text = item.trim();
                    if (!text) return null;
                    // Strip pricing info from free-text treatment string for referring hospital
                    const displayText = isReferring
                      ? text.replace(/₦[\d,]+(\s*[×x]\s*[\d,]+)?/gi, "").replace(/\([\s\S]*?\)/g, "").trim()
                      : text;
                    const hasPrice = !isReferring && text.includes("₦");
                    if (!displayText) return null;
                    return (
                      <div
                        key={idx}
                        className="flex flex-col gap-1 text-xs text-slate-700 bg-slate-50/70 px-3 py-2 rounded-lg border border-slate-200/80"
                      >
                        <div className="flex items-start gap-2">
                          <FileText className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                          <span className="font-medium text-slate-900 leading-tight">
                            {hasPrice ? displayText.split("(")[0].trim() : displayText}
                          </span>
                        </div>
                        {hasPrice && (
                          <div className="pl-5.5 text-[11px] text-slate-500">
                            Calculation: {text.split("(")[1]?.replace(")", "").trim()}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-400 italic py-1">No itemized treatment records available.</p>
                )}
              </div>

              {/* Confidentiality notice — only shown to referring hospital */}
              {isReferring && (
                <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
                  <span className="font-semibold">Confidential:</span> Tariff pricing is restricted to the treating facility.
                  Only <span className="font-semibold">{claimOwnerNameFor(selectedRequest) || "the treating hospital"}</span> may submit the claim for financial settlement.
                </div>
              )}
            </div>
          </div>

          {/* Submission and Action States */}
          {!canSubmit ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-center text-slate-700 text-xs">
              <p className="font-semibold text-slate-900">Claim Restricted</p>
              <p className="mt-0.5 text-slate-500 text-[11px]">
                Only {claimOwnerNameFor(selectedRequest) || "the treating hospital"} can submit this claim for settlement.
              </p>
            </div>
          ) : isCodeLocked ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-amber-950 text-xs">
              <p className="font-bold flex items-center justify-center gap-1.5 text-amber-900">
                <Lock className="h-3.5 w-3.5 text-amber-700" /> Authorization Code Locked
              </p>
              <p className="mt-1 text-slate-700 text-xs">
                This authorization code is locked. Please unlock it with the patient's arrival PIN in the Authorizations ledger before claiming.
              </p>
            </div>
          ) : isLocked ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-center text-slate-700 text-xs">
              <p className="font-semibold text-slate-900">Claim Locked</p>
              <p className="mt-0.5 text-slate-500 text-[11px]">
                Claims must be submitted by the receiving hospital following referral transfer.
              </p>
            </div>
          ) : !isEligible && !claimStatus ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-center text-slate-700 text-xs">
              <p className="font-semibold text-slate-900">Not Eligible for Claim</p>
              <p className="mt-0.5 text-slate-500 text-[11px]">
                {selectedRequest?.deletion_status === "awaiting_admin_approval"
                  ? "This authorization request is awaiting deletion approval and cannot be claimed."
                  : isFrozen || isClaimRejected
                  ? "This authorization is not eligible for claim submission."
                  : String(selectedRequest?.status || "").toLowerCase() !== "approved" && String(selectedRequest?.status || "").toLowerCase() !== "partially_approved"
                  ? "Claims can only be submitted after authorization is approved."
                  : !selectedRequest?.authorization_code
                  ? "No authorization code assigned yet."
                  : "This request is not eligible for claim submission."}
              </p>
              {rejectionReason(selectedRequest) && (isClaimRejected || isFrozen) ? (
                <p className="mt-1.5 text-[11px] font-mono text-rose-700">
                  Reason: {rejectionReason(selectedRequest)}
                </p>
              ) : null}
            </div>
          ) : claimStatus ? (
            <div className={cn("rounded-lg border p-3 text-center text-xs", claimStatusClass(claimStatus))}>
              <p className="font-semibold">Claim Already Submitted</p>
              <p className="mt-0.5 font-bold uppercase">{displayStatus(claimStatus)}</p>
              <p className="mt-0.5 text-[11px] opacity-80">This authorization has already been claimed to prevent duplicates.</p>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsReviewing(false)}
                className="h-9 px-4 rounded-lg border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50"
              >
                Close
              </Button>
              <Button
                disabled={isSubmitting}
                onClick={handleClaimSubmit}
                className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Submitting Claim…
                  </>
                ) : (
                  "Confirm & Submit Claim"
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
