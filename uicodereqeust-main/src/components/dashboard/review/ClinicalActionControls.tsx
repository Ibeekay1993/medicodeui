
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, CheckCircle2, XCircle, Trash2 } from "lucide-react";

interface ClinicalActionControlsProps {
  request: any;
  editDecisionNote: string;
  setEditDecisionNote: (value: string) => void;
  processing: boolean;
  processingAction: "approve" | "decline" | "defer" | "save" | "delete" | "reassign" | null;
  allowDelete: boolean;
  setDeleteConfirmOpen: (value: boolean) => void;
  handleApprove: () => Promise<void>;
  handleDecline: () => Promise<void>;
  handleDefer?: () => Promise<void>;
  handleReassign?: () => Promise<void>;
  saveRecordEdits: () => Promise<void>;
  onClose: () => void;
  approvalResult: any;
  declineResult: any;
}

export function ClinicalActionControls({
  request,
  editDecisionNote,
  setEditDecisionNote,
  processing,
  processingAction,
  allowDelete,
  setDeleteConfirmOpen,
  handleApprove,
  handleDecline,
  handleDefer: _handleDefer,
  handleReassign,
  saveRecordEdits,
  onClose,
  approvalResult,
  declineResult,
}: ClinicalActionControlsProps) {
  const isPending = ["pending", "pending_referral", "pending_authorization"].includes(request?.status);
  const isAwaitingDeletion = request?.deletion_status === "awaiting_admin_approval";

  return (
    <div className="space-y-4 pt-4 border-t border-slate-100/80">
      {/* Decision Note Form Field */}
      <div className="space-y-2">
        <Label className="text-xs uppercase font-black text-slate-400 tracking-widest pl-1">
          Decision Note <span className="text-rose-500 font-bold">*</span>
        </Label>
        <Textarea
          placeholder="Enter clinical notes justifying approval, or the reason for decline/deferral…"
          value={editDecisionNote}
          onChange={(e) => setEditDecisionNote(e.target.value)}
          className="min-h-[90px] rounded-2xl bg-slate-50/70 border-slate-200/80 focus:bg-white focus:ring-2 focus:ring-primary/30 focus:border-transparent shadow-inner transition-all duration-300 font-medium text-slate-800"
          disabled={isAwaitingDeletion || processing}
        />
        <p className="text-xs font-medium text-slate-400 pl-0.5 leading-snug">
          Decision note is required before completing review actions (approvals or declines).
        </p>
      </div>

      {/* Decision Action Buttons */}
      {!isPending ? (
        <div className="flex flex-col items-stretch justify-end gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:gap-3">
          {request?.status === "referral_declined" && handleReassign && (
            <Button
              className="h-12 rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 text-xs font-black uppercase tracking-widest text-white hover:from-slate-700 hover:to-slate-800 shadow-[0_4px_15px_rgba(71,85,105,0.3)] transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
              onClick={handleReassign}
              disabled={processing || isAwaitingDeletion}
            >
              {processingAction === "reassign" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Reassign Referral
            </Button>
          )}
          <Button
            className="h-12 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-xs font-black uppercase tracking-widest text-white hover:from-slate-900 hover:to-black shadow-[0_4px_15px_rgba(15,23,42,0.3)] transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
            onClick={saveRecordEdits}
            disabled={processing || isAwaitingDeletion}
          >
            {processingAction === "save" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Save Edits
          </Button>
          <Button
            variant="outline"
            className="h-12 px-6 rounded-xl font-black text-xs uppercase tracking-widest border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
            onClick={onClose}
            disabled={processing}
          >
            Close
          </Button>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Delete trigger */}
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            {allowDelete && !approvalResult && !declineResult && (
              <Button
                variant="destructive"
                className="h-12 rounded-xl font-black text-xs uppercase tracking-widest gap-2 bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-100 hover:shadow-rose-200 transition-all active:scale-95"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={processing || isAwaitingDeletion}
              >
                <Trash2 className="h-4 w-4" /> Delete Request
              </Button>
            )}
          </div>

          {/* Right: Close / Decline / Approve Actions */}
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            {!approvalResult && !declineResult ? (
              <>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="h-12 px-6 rounded-xl font-black text-xs uppercase tracking-widest border-2 border-slate-200 hover:bg-slate-50 transition-all active:scale-95"
                  disabled={processing}
                >
                  Close
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDecline}
                  className="h-12 px-6 rounded-xl font-black text-xs uppercase tracking-widest bg-rose-600 hover:bg-rose-700 text-white active:scale-95 transition-all shadow-md shadow-rose-100"
                  disabled={processing || isAwaitingDeletion}
                >
                  {processingAction === "decline" ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-1.5" />
                  )}
                  Decline
                </Button>
                <Button
                  onClick={handleApprove}
                  className="h-12 rounded-xl bg-emerald-600 px-8 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-250 transition-all hover:bg-emerald-700 hover:shadow-emerald-300 active:scale-95"
                  disabled={processing || isAwaitingDeletion}
                >
                  {processingAction === "approve" ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  )}
                  Approve & Sign
                </Button>
              </>
            ) : (
              <Button
                onClick={onClose}
                className="h-12 px-8 rounded-xl font-black text-xs uppercase tracking-widest bg-slate-900 text-white shadow-xl hover:bg-slate-950 active:scale-95 transition-all"
              >
                Done
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
