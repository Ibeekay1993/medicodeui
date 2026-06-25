import { FileText, X, Loader2, CheckCircle2 } from "lucide-react";
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
}

export default function ClaimReviewDialog({
  isReviewing,
  setIsReviewing,
  selectedRequest,
  hospital,
  claimStatusFor,
  isSubmitting,
  handleClaimSubmit
}: ClaimReviewDialogProps) {
  const claimStatus = selectedRequest ? claimStatusFor(selectedRequest) : undefined;
  const isReferred = selectedRequest ? isReferralFor(selectedRequest) : false;
  const isReferring = (selectedRequest && hospital) ? isReferringHospitalFor(selectedRequest, hospital) : false;
  const canSubmit = (selectedRequest && hospital) ? canSubmitClaimFor(selectedRequest, hospital) : false;
  const isLocked = (selectedRequest && hospital) ? isClaimLockedAfterTransfer(selectedRequest, hospital) : false;
  const isFrozen = selectedRequest ? isFrozenAuthorization(selectedRequest) : false;
  const isEligible = (selectedRequest && hospital) ? isClaimEligible(selectedRequest, hospital) : false;
  const isClaimRejected = selectedRequest ? isRejected(selectedRequest) : false;

  return (
    <Dialog open={isReviewing} onOpenChange={setIsReviewing}>
      <DialogContent className="max-w-md rounded-2xl border-none shadow-2xl p-0 overflow-hidden">
        <div className="bg-slate-900 p-6 text-white relative">
          <h2 className="text-sm font-black uppercase tracking-tight italic">
            Claim <span className="text-emerald-400">Review</span>
          </h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
            Final Verification Stage
          </p>
          <button 
            onClick={() => setIsReviewing(false)} 
            className="absolute right-4 top-4 text-slate-500 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-black text-slate-900 uppercase">{selectedRequest?.patient_name}</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Policy: {selectedRequest?.policy_number}
                </p>
              </div>
            </div>
            {isReferred ? (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs font-bold leading-relaxed text-blue-900">
                Request Raised By: {selectedRequest?.requesting_hospital_name || selectedRequest?.hospital_name || "Original hospital"}<br />
                Treatment and Claims Assigned To: {claimOwnerNameFor(selectedRequest)}<br />
                {canSubmit
                  ? "Your hospital can submit and receive payment for this authorization."
                  : "This code is visible for coordination only. Claims and payment are restricted to the treating hospital."}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg border border-slate-100 bg-white">
                <p className="text-xs font-black text-slate-400 uppercase mb-1">Auth Code</p>
                <p className={cn("text-xs font-mono font-black", selectedRequest?.deletion_status === "awaiting_admin_approval" ? "text-rose-700" : "text-primary")}>
                  {selectedRequest?.deletion_status === "awaiting_admin_approval" ? "WITHDRAWN - Awaiting Delete" : selectedRequest?.authorization_code}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-100 bg-white">
                <p className="text-xs font-black text-slate-400 uppercase mb-1">Total Amount</p>
                {hospital && selectedRequest && isReferring ? (
                  <p className="text-xs font-black text-slate-400 font-mono">Not visible (referred)</p>
                ) : (
                  <p className="text-xs font-black text-emerald-600 font-mono">₦{selectedRequest?.total_amount?.toLocaleString() || "0"}</p>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-100 bg-white space-y-3">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase mb-1">Diagnosis</p>
                <p className="text-xs font-black text-slate-900 uppercase leading-tight">{selectedRequest?.diagnosis || "Not Specified"}</p>
              </div>
              {!isReferring ? (
                <div className="pt-2 border-t border-slate-50">
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Treatment / Drugs / Breakdown</p>
                  <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                    {getApprovedItems(selectedRequest).length > 0 ? (
                      getApprovedItems(selectedRequest).map((item: any, idx: number) => {
                        const isDeclined = !!item.declined;
                        const qty = Number(item.quantity || item.qty || 1);
                        const unitPrice = Number(item.unit_price || item.price || item.unitPrice || 0);
                        const total = isDeclined ? 0 : Number(item.total || qty * unitPrice || 0);
                        return (
                          <div 
                            key={`${item.code || item.name || idx}`} 
                            className={cn(
                              "flex flex-col gap-1 text-xs font-bold px-3 py-2 rounded-lg border",
                              isDeclined 
                                ? "bg-rose-50/50 border-rose-100/50 text-rose-900/60" 
                                : "bg-slate-50 border-slate-100 text-slate-600"
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <FileText className={cn("h-3 w-3 mt-0.5 shrink-0", isDeclined ? "text-rose-300" : "text-slate-300")} />
                              <span className={cn("uppercase leading-tight break-words flex-1", isDeclined ? "line-through text-rose-900/60" : "text-slate-900")}>
                                {item.code ? `${item.code} - ` : ""}{item.name || item.item_name || "Approved item"}
                              </span>
                              {isDeclined && (
                                <Badge variant="outline" className="border-rose-200 bg-rose-100/50 text-xs font-black uppercase tracking-wider text-rose-700 px-1 py-0 h-4 shrink-0">
                                  Declined
                                </Badge>
                              )}
                            </div>
                            <div className="pl-5 flex flex-wrap items-center justify-between gap-2">
                              <p className={cn("text-xs font-black uppercase tracking-tight italic", isDeclined ? "text-rose-700/50" : "text-emerald-600")}>
                                {qty} unit{qty === 1 ? "" : "s"} x ₦{unitPrice.toLocaleString()}
                              </p>
                              <p className={cn("text-xs font-black font-mono", isDeclined ? "text-rose-750 line-through" : "text-slate-900")}>
                                ₦{total.toLocaleString()}
                              </p>
                            </div>
                            {isDeclined && item.decline_reason && (
                              <div className="text-xs text-rose-750 font-medium bg-rose-100/30 rounded-md px-2 py-1 border border-rose-200/40 mt-1 pl-5">
                                <span className="font-bold text-rose-800">Reason for decline:</span> {item.decline_reason}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : selectedRequest?.treatment?.split(/[;,]/).map((item: string, idx: number) => {
                      const text = item.trim();
                      if (!text) return null;
                      const hasPrice = text.includes("₦");
                      return (
                        <div key={idx} className="flex flex-col gap-1 text-xs font-bold text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                          <div className="flex items-start gap-2">
                            <FileText className="h-3 w-3 text-slate-300 mt-0.5 shrink-0" />
                            <span className="uppercase text-slate-900 leading-tight break-words">
                              {hasPrice ? text.split("(")[0].trim() : text}
                            </span>
                          </div>
                          {hasPrice && (
                            <div className="pl-5 flex items-center justify-between">
                              <p className="text-xs font-black text-emerald-600 uppercase tracking-tight italic">
                                Calculation: {text.split("(")[1]?.replace(")", "").trim()}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    }) || <p className="text-xs text-slate-300 italic">No treatment data recorded</p>}
                  </div>
                </div>
              ) : (
                <div className="pt-4 border-t border-slate-50 text-center text-slate-400">
                  <p className="text-xs font-black uppercase tracking-widest">Treatment Details Hidden</p>
                  <p className="text-xs mt-1 font-semibold">Pre-authorization and treatment items are hidden from the referring hospital.</p>
                </div>
              )}
            </div>
          </div>

          {!canSubmit ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center text-blue-900">
              <p className="text-xs font-black uppercase tracking-widest">Claim Restricted</p>
              <p className="mt-1 text-xs font-bold font-sans">
                Only {claimOwnerNameFor(selectedRequest) || "the treating hospital"} can submit this claim.
              </p>
            </div>
          ) : isLocked ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-rose-900">
              <p className="text-xs font-black uppercase tracking-widest">Claim Blocked</p>
              <p className="mt-1 text-xs font-bold font-sans">
                Claims must be submitted by the receiving hospital after referral transfer.
              </p>
            </div>
          ) : !isEligible && !claimStatus ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-amber-900">
              <p className="text-xs font-black uppercase tracking-widest">Not Eligible for Claim</p>
              <p className="mt-1 text-xs font-bold font-sans">
                {selectedRequest?.deletion_status === "awaiting_admin_approval"
                  ? "This authorization request is awaiting deletion approval and cannot be claimed."
                  : isFrozen || isClaimRejected
                  ? "This authorization is not eligible for claim submission."
                  : String(selectedRequest?.status || "").toLowerCase() !== "approved"
                  ? "Claims can only be submitted after authorization is approved."
                  : !selectedRequest?.authorization_code
                  ? "No authorization code assigned yet."
                  : "This request is not eligible for claim submission."}
              </p>
              {rejectionReason(selectedRequest) && (isClaimRejected || isFrozen) ? (
                <p className="mt-2 text-xs font-mono font-black leading-snug">Reason: {rejectionReason(selectedRequest)}</p>
              ) : null}
            </div>
          ) : claimStatus ? (
            <div className={cn("rounded-xl border p-4 text-center", claimStatusClass(claimStatus))}>
              <p className="text-xs font-black uppercase tracking-widest">Claim Already Submitted</p>
              <p className="mt-1 text-xs font-black uppercase">{displayStatus(claimStatus)}</p>
              <p className="mt-1 text-xs font-semibold opacity-80">This authorization is locked against duplicate submission.</p>
            </div>
          ) : (
            <Button 
              disabled={isSubmitting} 
              onClick={handleClaimSubmit}
              className="w-full h-12 rounded-xl bg-slate-900 text-xs font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 active:scale-95 transition-all text-white"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : "Confirm & Submit Claim"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
