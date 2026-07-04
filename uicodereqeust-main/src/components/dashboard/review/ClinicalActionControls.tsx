import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

interface ClinicalActionControlsProps {
  request: any;
  editDecisionNote?: string;
  setEditDecisionNote?: (value: string) => void;
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

export const ClinicalActionControls = React.memo(function ClinicalActionControls({
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
    <div className="w-full space-y-3">
      {/* Decision Note - always visible for pending requests */}
      {isPending && !approvalResult && !declineResult && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] sm:text-xs uppercase font-black text-slate-500 tracking-wider pl-1">
              Decision Note <span className="text-rose-500">*</span>
            </label>
            <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">Required for approval/decline</span>
          </div>
          <Textarea
            placeholder="Add a note for this decision..."
            value={editDecisionNote || ""}
            onChange={(e) => setEditDecisionNote?.(e.target.value)}
            className="min-h-[50px] sm:min-h-[70px] rounded-xl border-slate-200 text-sm font-semibold bg-white focus:ring-primary/20"
            disabled={processing || isAwaitingDeletion}
          />
        </div>
      )}

      {/* Decision Action Buttons */}
      {!isPending ? (
        /* ─── Non-pending: Save Edits + optional Reassign + Close ─── */
        <div className="flex w-full items-center justify-between border-t border-slate-100 pt-3 sm:pt-4">
          
          {/* Desktop Layout */}
          <div className="hidden sm:flex w-full flex-row items-center justify-end gap-3">
            {request?.status === "referral_declined" && handleReassign && (
              <Button
                className="h-12 rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 text-xs font-black uppercase tracking-widest text-white hover:from-slate-700 hover:to-slate-800 shadow-md transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
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
              className="h-12 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-xs font-black uppercase tracking-widest text-white hover:from-slate-900 hover:to-black shadow-md transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.98]"
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

          {/* Mobile Layout */}
          <div className="flex sm:hidden w-full flex-row items-center gap-2">
            <Button
              className="h-11 flex-1 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-[11px] font-black uppercase tracking-widest text-white shadow-md active:scale-95"
              onClick={saveRecordEdits}
              disabled={processing || isAwaitingDeletion}
            >
              {processingAction === "save" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
          </div>

        </div>
      ) : (
        /* ─── Pending: Delete + Decline + Approve ─── */
        <div className="flex w-full items-center justify-between border-t border-slate-100 pt-3 sm:pt-4">
          
          {/* Desktop Layout */}
          <div className="hidden sm:flex w-full flex-row items-center justify-between gap-3">
            <div className="flex flex-row items-center gap-3">
              {allowDelete && !approvalResult && !declineResult && (
                <Button
                  variant="destructive"
                  className="h-12 rounded-xl font-black text-xs uppercase tracking-widest gap-2 bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-100 hover:shadow-rose-200 transition-all active:scale-95"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={processing || isAwaitingDeletion}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Request
                </Button>
              )}
            </div>

            <div className="flex flex-row items-center gap-3">
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

          {/* Mobile Layout (Horizontal Buttons) */}
          <div className="flex sm:hidden w-full flex-row items-center gap-1.5">
            {!approvalResult && !declineResult ? (
              <>
                {allowDelete && (
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="h-11 w-11 shrink-0 p-0 rounded-xl bg-rose-100 text-rose-600 hover:bg-rose-200 active:scale-95 transition-all shadow-sm border border-rose-200"
                    disabled={processing || isAwaitingDeletion}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={handleDecline}
                  className="h-11 flex-1 rounded-xl bg-rose-600 text-[11px] font-black uppercase tracking-widest text-white shadow-md transition-all active:scale-95"
                  disabled={processing || isAwaitingDeletion}
                >
                  {processingAction === "decline" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                  )}
                  Decline
                </Button>
                <Button
                  onClick={handleApprove}
                  className="h-11 flex-1 rounded-xl bg-emerald-600 text-[11px] font-black uppercase tracking-widest text-white shadow-md transition-all active:scale-95"
                  disabled={processing || isAwaitingDeletion}
                >
                  {processingAction === "approve" ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  )}
                  Approve
                </Button>
              </>
            ) : (
              <Button
                onClick={onClose}
                className="h-11 w-full rounded-xl font-black text-[11px] uppercase tracking-widest bg-slate-900 text-white shadow-md active:scale-95 transition-all"
              >
                Done
              </Button>
            )}
          </div>

        </div>
      )}
    </div>
  );
});
