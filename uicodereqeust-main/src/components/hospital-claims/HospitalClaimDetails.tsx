import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormattedAuditNote } from "@/components/ui/FormattedAuditNote";
import { FileText, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ClaimDraft,
  claimAuditItems,
  hasContestableDeductions
} from "@/lib/claims-helpers";

interface HospitalClaimDetailsProps {
  selectedClaim: ClaimDraft;
  statusClass?: (status?: string | null) => string;
  statusLabel: (status?: string | null) => string;
  onContestClick: (claim: ClaimDraft) => void;
  onAcceptPayment?: (claim: ClaimDraft) => void;
}

export default function HospitalClaimDetails({
  selectedClaim,
  statusLabel,
  onContestClick,
  onAcceptPayment
}: HospitalClaimDetailsProps) {
  const auditedItems = claimAuditItems(selectedClaim);
  const showContestBanner = hasContestableDeductions(selectedClaim);

  return (
    <div className="space-y-4">
      {/* Patient & Claim Top Strip */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <Badge
            className={cn(
              "text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full border shadow-none",
              (() => {
                const s = String(selectedClaim.status || "").toLowerCase();
                const map: Record<string, string> = {
                  approved: "bg-emerald-600 text-white border-transparent",
                  partially_approved: "bg-sky-600 text-white border-transparent",
                  paid: "bg-emerald-700 text-white border-transparent",
                  rejected: "bg-rose-600 text-white border-transparent",
                  declined: "bg-rose-600 text-white border-transparent",
                  contested: "bg-purple-600 text-white border-transparent",
                  pending: "bg-amber-500 text-white border-transparent",
                  submitted: "bg-amber-500 text-white border-transparent",
                  under_review: "bg-sky-500 text-white border-transparent",
                };
                return map[s] || "bg-slate-600 text-white border-transparent";
              })()
            )}
          >
            {statusLabel(selectedClaim.status)}
          </Badge>
          <span className="font-mono text-xs text-slate-500">
            {selectedClaim.created_at ? new Date(selectedClaim.created_at).toLocaleDateString("en-GB") : "—"}
          </span>
        </div>
        <h3 className="text-sm font-bold text-slate-900 leading-tight">{selectedClaim.patient_name}</h3>
        <p className="font-mono text-xs text-slate-500 mt-0.5">
          {selectedClaim.policy_number} {selectedClaim.auth_code ? `· Auth: ${selectedClaim.auth_code}` : ""}
        </p>
      </div>

      <div className="space-y-4">
        {/* Itemized Breakdown */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-slate-400" /> Itemized Breakdown
            </h4>
            <span className="text-[10px] text-slate-600 font-semibold">{auditedItems.length} items</span>
          </div>

          <div className="space-y-1.5 bg-slate-50/70 rounded-lg p-2.5 border border-slate-200">
            {auditedItems.map((item: any, idx: number) => {
              const declined = item.audit_status === "declined" || item.status === "declined";
              return (
                <div
                  key={idx}
                  className={cn(
                    "rounded-lg border p-2 text-xs",
                    declined ? "border-rose-200 bg-rose-50/60" : "border-slate-200/80 bg-white"
                  )}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className={cn("font-medium pr-1", declined ? "text-rose-700 line-through" : "text-slate-800")}>
                      {item.name} <span className="text-slate-500 font-normal">× {item.approved_quantity ?? item.quantity}</span>
                    </span>
                    <span className="font-mono font-semibold text-slate-900 shrink-0">
                      ₦{Number(item.approved_total ?? item.total ?? 0).toLocaleString("en-NG")}
                    </span>
                  </div>
                  {(item.hospital_explanation || item.decline_reason || item.audit_reason) && (
                    <div className="mt-1.5 rounded bg-white/90 p-2 border border-rose-200/80">
                      <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">
                        Auditor explanation
                      </p>
                      <p className="mt-0.5 text-xs text-slate-700 leading-snug">
                        {item.hospital_explanation || item.audit_reason || item.decline_reason}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="pt-2 mt-2 border-t border-slate-200 space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Submitted Total:</span>
                <span className="font-mono font-bold text-slate-900">
                  ₦{Number(selectedClaim.total_amount || 0).toLocaleString("en-NG")}
                </span>
              </div>
              {selectedClaim.approved_amount !== null && selectedClaim.approved_amount !== undefined && (
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-emerald-700">Audited Approved:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    ₦{Number(selectedClaim.approved_amount).toLocaleString("en-NG")}
                  </span>
                </div>
              )}
              {Number(selectedClaim.declined_amount || 0) > 0 && (
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-rose-700">Audited Deductions:</span>
                  <span className="font-mono font-bold text-rose-600">
                    -₦{Number(selectedClaim.declined_amount).toLocaleString("en-NG")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedClaim.notes && (
          <div>
            <h4 className="text-xs font-semibold text-slate-700 mb-1.5">
              Clinical / Audit Notes
            </h4>
            <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs">
              <FormattedAuditNote text={selectedClaim.notes} />
            </div>
          </div>
        )}

        {/* Contest & Appeal Controls Block */}
        {selectedClaim.status === "contested" ? (
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg space-y-1">
            <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-600" /> Decision Under Appeal Review
            </span>
            <p className="text-xs text-amber-700 leading-relaxed">
              You have submitted a contest appeal for this claim. The clinical audit team is reconciling your
              justification. Payout status is pending review.
            </p>
          </div>
        ) : selectedClaim.payment_status === "awaiting_payment" ? (
          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg space-y-1">
            <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Ready for Payment Batch
            </span>
            <p className="text-xs text-emerald-700 leading-relaxed">
              This claim has been released to the HMO payment queue and is awaiting the next settlement batch.
            </p>
          </div>
        ) : showContestBanner ? (
          <div className="bg-rose-50/70 border border-rose-200 p-3 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-600" /> Deductions Applied
              </span>
              {selectedClaim.contest_deadline && (
                <span className="text-[10px] font-semibold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-200">
                  {Math.max(0, Math.ceil((new Date(selectedClaim.contest_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days left to contest
                </span>
              )}
            </div>
            <p className="text-xs text-rose-700 leading-relaxed">
              Some items were adjusted during clinical audit. You can submit a dispute with justifications or accept the audited total to expedite settlement.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => onContestClick(selectedClaim)}
                className="w-full bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 font-semibold text-xs h-8 rounded-lg"
              >
                Contest Deductions
              </Button>
              {onAcceptPayment && (
                <Button
                  onClick={() => onAcceptPayment(selectedClaim)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 rounded-lg shadow-sm"
                >
                  Accept & Expedite Payment
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
