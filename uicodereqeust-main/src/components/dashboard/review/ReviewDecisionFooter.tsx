import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandSpinner } from "@/components/BrandSpinner";
import { Lock, Unlock, XCircle, CheckCircle2 } from "lucide-react";

interface ReviewDecisionFooterProps {
  request: any;
  role: string | null | undefined;
  isLocked: boolean;
  isDecided: boolean;
  isDeletionLocked: boolean;
  requestDetailsLoaded: boolean;
  editDecisionNote: string;
  setEditDecisionNote: (value: string) => void;
  processing: boolean;
  processingAction: string | null;
  unlockLoading: boolean;
  onUnlockRecord: () => void;
  onDecline: () => void;
  onApprove: () => void;
  onClose: () => void;
}

export const ReviewDecisionFooter = React.memo(function ReviewDecisionFooter({
  request,
  role,
  isLocked,
  isDecided,
  isDeletionLocked,
  requestDetailsLoaded,
  editDecisionNote,
  setEditDecisionNote,
  processing,
  processingAction,
  unlockLoading,
  onUnlockRecord,
  onDecline,
  onApprove,
  onClose,
}: ReviewDecisionFooterProps) {
  const isLeadOrAdmin = role === "admin" || role === "utilization_manager_lead";

  return (
    <>
      {/* Decision Section */}
      <div className="mt-4 mb-2">
        <div className="text-[13px] sm:text-[14px] font-extrabold text-slate-800 uppercase tracking-wide mb-2 flex items-center justify-between">
          <span>
            {isLocked ? "Decision Note (Saved)" : "Review Decision"}{" "}
            {!isLocked && <span className="text-red-500">*</span>}
          </span>
          {!isLocked && (
            <span className="text-[11px] text-slate-400 font-normal lowercase normal-case">
              required for decision
            </span>
          )}
        </div>
        <textarea
          className="w-full p-3 border border-slate-100 rounded-xl text-[13px] sm:text-[14px] font-bold text-slate-800 bg-slate-50 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1 disabled:opacity-80"
          placeholder={isLocked ? "No decision note recorded" : "Enter reason for approval or decline..."}
          value={editDecisionNote}
          onChange={(e) => setEditDecisionNote(e.target.value)}
          readOnly={isLocked || isDeletionLocked}
        />
      </div>

      {/* Tab 2 footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 sm:pt-4 border-t border-slate-100">
        <div className="flex items-center gap-2">
          {isLocked ? (
            <Badge
              variant="outline"
              className="px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-700 border-slate-200 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500" /> Record Locked ({request?.status?.replace("_", " ")})
            </Badge>
          ) : isDecided && request?.is_unlocked ? (
            <Badge
              variant="outline"
              className="px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border-amber-300 flex items-center gap-1.5"
            >
              <Unlock className="w-3.5 h-3.5 text-amber-700" /> Unlocked for Revision
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="w-full sm:w-auto h-11 sm:h-12 px-6 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-widest border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all sm:flex-shrink-0 sm:min-w-[100px]"
            onClick={onClose}
          >
            Close
          </Button>

          {isLocked ? (
            isLeadOrAdmin && (
              <Button
                onClick={onUnlockRecord}
                disabled={unlockLoading}
                className="w-full sm:w-auto h-11 sm:h-12 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                {unlockLoading ? <BrandSpinner className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                Unlock Record
              </Button>
            )
          ) : role === "hospital" ? null : (
            <>
              <Button
                className="w-full sm:w-auto sm:flex-1 h-11 sm:h-12 px-6 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-1.5"
                onClick={onDecline}
                disabled={!requestDetailsLoaded || processing || !editDecisionNote}
              >
                {processingAction === "decline" ? (
                  <BrandSpinner className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {isDecided ? "Update & Decline" : "Decline"}
              </Button>
              <Button
                className="w-full sm:w-auto sm:flex-1 h-11 sm:h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-1.5"
                onClick={onApprove}
                disabled={!requestDetailsLoaded || processing}
              >
                {processingAction === "approve" ? (
                  <BrandSpinner className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {isDecided ? "Update & Re-Approve" : "Approve"}
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
});
