import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandSpinner } from "@/components/BrandSpinner";
import { Lock, Unlock } from "lucide-react";
import { areHospitalNamesMatching } from "@/lib/authorizations-helpers";

interface ClinicalLockBannersProps {
  request: any;
  role: string | null | undefined;
  isLocked: boolean;
  isDecided: boolean;
  unlockLoading: boolean;
  onUnlockRecord: () => void;
  onLockRecord: () => void;
  requestingHospitalName: string;
  primaryHospital?: { hcp_code?: string; hcp_name?: string } | null;
  formattedNotes?: string;
}

export const ClinicalLockBanners = React.memo(function ClinicalLockBanners({
  request,
  role,
  isLocked,
  isDecided,
  unlockLoading,
  onUnlockRecord,
  onLockRecord,
  requestingHospitalName,
  primaryHospital,
  formattedNotes,
}: ClinicalLockBannersProps) {
  const isLeadOrAdmin = role === "admin" || role === "utilization_manager_lead";

  return (
    <>
      {/* Locked status banner */}
      {isLocked && (
        <div className="p-4 rounded-2xl text-xs border bg-slate-100/90 border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-slate-800 shadow-xs animate-in fade-in duration-300">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center text-slate-700 shrink-0">
              <Lock className="w-4 h-4 text-slate-700" />
            </div>
            <div className="min-w-0">
              <p className="font-black uppercase tracking-wider text-xs text-slate-900 flex items-center gap-2">
                <span>Record Locked</span>
                <Badge variant="outline" className="text-[10px] font-black uppercase bg-slate-200 text-slate-700 border-0 px-1.5 py-0">
                  {request?.status?.replace("_", " ")}
                </Badge>
              </p>
              <p className="font-medium text-slate-500 text-[11px] mt-0.5">
                This authorization has been decided and is locked for clinical data integrity.
                {isLeadOrAdmin
                  ? " A Utilization Manager Lead or Admin can unlock this record for revision."
                  : " A Utilization Manager Lead must unlock this record before it can be revised."}
              </p>
            </div>
          </div>
          {isLeadOrAdmin && (
            <Button
              type="button"
              size="sm"
              onClick={onUnlockRecord}
              disabled={unlockLoading}
              className="shrink-0 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider gap-1.5 shadow-sm h-9 px-4"
            >
              {unlockLoading ? <BrandSpinner className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
              Unlock Record
            </Button>
          )}
        </div>
      )}

      {/* Unlocked status banner */}
      {isDecided && request?.is_unlocked && (
        <div className="p-4 rounded-2xl text-xs border bg-amber-50 border-amber-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-950 shadow-xs animate-in fade-in duration-300">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
              <Unlock className="w-4 h-4 text-amber-700" />
            </div>
            <div className="min-w-0">
              <p className="font-black uppercase tracking-wider text-xs text-amber-900">
                Record Unlocked for Revision
              </p>
              <p className="font-medium text-amber-700 text-[11px] mt-0.5">
                Amendments are enabled. Submitting an approval or decline will re-lock the record and notify the hospital with the updated details.
              </p>
            </div>
          </div>
          {isLeadOrAdmin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onLockRecord}
              disabled={unlockLoading}
              className="shrink-0 rounded-xl border-amber-300 bg-white hover:bg-amber-100 text-amber-900 text-xs font-black uppercase tracking-wider gap-1.5 h-9 px-4"
            >
              {unlockLoading ? <BrandSpinner className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              Re-lock Record
            </Button>
          )}
        </div>
      )}

      {/* Standard Request Facility Banner (Non-Referral) */}
      {!request?.referred_hospital_name && (request?.requesting_hospital_name || requestingHospitalName) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 mb-3 min-w-0">
          <div className="text-[11px] font-medium text-slate-500">
            Requesting Facility
          </div>
          <div className="text-sm sm:text-base font-semibold text-slate-900 mt-1 leading-snug break-words [overflow-wrap:anywhere]">
            {areHospitalNamesMatching(requestingHospitalName, primaryHospital?.hcp_name) && primaryHospital?.hcp_name
              ? primaryHospital.hcp_name
              : requestingHospitalName || "Unknown Hospital"}
          </div>
          {formattedNotes && (
            <div className="text-xs font-normal text-slate-600 mt-1 leading-relaxed break-words [overflow-wrap:anywhere]">
              <span className="font-medium text-slate-700">Clinical notes:</span> {formattedNotes}
            </div>
          )}
        </div>
      )}

      {/* Referral Banner */}
      {request?.referred_hospital_name && (
        <div className="rounded-lg border border-slate-200 border-l-4 border-l-sky-700 bg-slate-50/60 px-3 py-2.5 mb-3 min-w-0">
          <div className="text-[11px] font-medium text-slate-500">
            Referral Request
          </div>
          <div className="text-sm sm:text-base font-semibold text-slate-900 mt-1 leading-snug break-words [overflow-wrap:anywhere]">
            Referred to: {request.referred_hospital_name}
          </div>
          <div className="text-xs font-normal text-slate-600 mt-1 leading-relaxed break-words [overflow-wrap:anywhere]">
            {formattedNotes ? `Notes from ${requestingHospitalName}: ${formattedNotes}` : `Patient referred by ${requestingHospitalName} for further clinical evaluation and management.`}
          </div>
        </div>
      )}
    </>
  );
});
