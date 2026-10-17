import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormattedAuditNote } from "@/components/ui/FormattedAuditNote";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ClaimDraft,
  claimAuditItems,
  hasContestableDeductions
} from "@/lib/claims-helpers";

interface HospitalClaimDetailsProps {
  selectedClaim: ClaimDraft;
  statusClass: (status?: string | null) => string;
  statusLabel: (status?: string | null) => string;
  onContestClick: (claim: ClaimDraft) => void;
  onAcceptPayment?: (claim: ClaimDraft) => void;
}

export default function HospitalClaimDetails({
  selectedClaim,
  statusClass,
  statusLabel,
  onContestClick,
  onAcceptPayment
}: HospitalClaimDetailsProps) {
  const auditedItems = claimAuditItems(selectedClaim);
  const showContestBanner = hasContestableDeductions(selectedClaim);

  return (
    <div className="space-y-5">
      <div className="p-5 border-b border-slate-50 bg-slate-50/50 rounded-t-lg">
        <div className="flex items-center justify-between mb-3">
          <Badge
            variant="outline"
            className={cn(
              "text-xs font-bold uppercase tracking-widest px-2 py-0.5",
              statusClass(selectedClaim.status)
            )}
          >
            {statusLabel(selectedClaim.status)}
          </Badge>
          <span className="font-mono text-sm font-bold text-slate-500">
            {selectedClaim.created_at ? new Date(selectedClaim.created_at).toLocaleDateString("en-GB") : "—"}
          </span>
        </div>
        <h3 className="text-sm font-black uppercase text-slate-950 leading-tight">{selectedClaim.patient_name}</h3>
        <p className="font-mono text-sm font-bold text-slate-500 mt-1">
          {selectedClaim.policy_number} · {selectedClaim.auth_code}
        </p>
      </div>

      <div className="px-5 pb-5 space-y-5">
        <div>
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
            <FileText className="h-3 w-3" /> Itemized Breakdown
          </h4>
          <div className="space-y-2 bg-slate-50 rounded-lg p-3 border border-slate-100">
            {auditedItems.map((item: any, idx: number) => {
              const declined = item.audit_status === "declined" || item.status === "declined";
              return (
                <div
                  key={idx}
                  className={cn(
                    "rounded-lg border p-2 text-xs",
                    declined ? "border-rose-100 bg-rose-50/70" : "border-slate-100 bg-white"
                  )}
                >
                  <div className="flex justify-between items-start gap-3">
                    <span className={cn("font-bold pr-2", declined ? "text-rose-700 line-through" : "text-slate-700")}>
                      {item.name} <span className="text-slate-400 font-normal">x{item.approved_quantity ?? item.quantity}</span>
                    </span>
                    <span className="font-mono font-black text-slate-900">
                      ₦{Number(item.approved_total ?? item.total ?? 0).toLocaleString()}
                    </span>
                  </div>
                  {(item.hospital_explanation || item.decline_reason || item.audit_reason) && (
                    <div className="mt-2 rounded-md bg-white/80 p-2 border border-rose-100">
                      <p className="text-xs font-black uppercase tracking-widest text-rose-500">
                        Auditor explanation
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">
                        {item.hospital_explanation || item.audit_reason || item.decline_reason}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="pt-2 mt-2 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest text-slate-900">Total Claim</span>
              <span className="font-mono font-bold text-emerald-600 text-sm">
                ₦{Number(selectedClaim.total_amount).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {selectedClaim.notes && (
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
              Clinical/Audit Notes
            </h4>
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
              <FormattedAuditNote text={selectedClaim.notes} />
            </div>
          </div>
        )}

        {/* Contest & Appeal Controls Block */}
        {selectedClaim.status === "contested" ? (
          <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl space-y-1">
            <span className="text-xs font-black uppercase text-amber-700 tracking-wider block">
              Decision Under Appeal Review
            </span>
            <p className="text-xs font-medium text-amber-600 leading-snug">
              You have submitted a contest appeal for this claim. The clinical audit panel is manually reconciling your
              justification. Payout status is pending review.
            </p>
          </div>
        ) : selectedClaim.payment_status === "awaiting_payment" ? (
          <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl space-y-1">
            <span className="text-xs font-black uppercase text-emerald-700 tracking-wider block">
              ✓ Ready for Payment Batch
            </span>
            <p className="text-xs font-medium text-emerald-600 leading-snug">
              This claim has been released to the HMO payment queue and is awaiting the next settlement batch.
            </p>
          </div>
        ) : showContestBanner ? (
          <div className="bg-rose-50 border border-rose-100 p-3.5 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-rose-700 tracking-wider block">
                Deductions Detected
              </span>
              {selectedClaim.contest_deadline && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-full">
                  {Math.max(0, Math.ceil((new Date(selectedClaim.contest_deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days left to dispute
                </span>
              )}
            </div>
            <p className="text-[11px] font-medium text-rose-600 leading-snug">
              Some items were excluded or adjusted during the clinical audit. You can submit a dispute with justifications within the 7-day window, or accept the audited total to expedite settlement.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => onContestClick(selectedClaim)}
                className="w-full bg-white hover:bg-rose-100 border border-rose-200 text-rose-600 font-bold text-xs h-9 rounded-lg transition-all"
              >
                Contest Decisions
              </Button>
              {onAcceptPayment && (
                <Button
                  onClick={() => onAcceptPayment(selectedClaim)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 rounded-lg transition-all shadow-sm"
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
