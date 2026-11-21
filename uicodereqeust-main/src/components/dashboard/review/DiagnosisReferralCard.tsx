import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { HospitalReferralField } from "@/components/HospitalReferralField";

interface DiagnosisReferralCardProps {
  request: any;
  role: string | null | undefined;
  requestDetailsLoaded: boolean;
  isHospitalDirected: boolean;
  isLocked: boolean;
  isDeletionLocked: boolean;
  editDiagnosis: string;
  setEditDiagnosis: (value: string) => void;
  editTreatment: string;
  setEditTreatment: (value: string) => void;
  onBlurTreatment: () => void;
  referralCollapsed: boolean;
  setReferralCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  editReferralHospitalName: string;
  setEditReferralHospitalName: (name: string) => void;
  editReferralHospitalId: string | null;
  setEditReferralHospitalId: (id: string | null) => void;
}

export const DiagnosisReferralCard = React.memo(function DiagnosisReferralCard({
  request,
  role,
  requestDetailsLoaded,
  isHospitalDirected,
  isLocked,
  isDeletionLocked,
  editDiagnosis,
  setEditDiagnosis,
  editTreatment,
  setEditTreatment,
  onBlurTreatment,
  referralCollapsed,
  setReferralCollapsed,
  editReferralHospitalName,
  setEditReferralHospitalName,
  editReferralHospitalId,
  setEditReferralHospitalId,
}: DiagnosisReferralCardProps) {
  const isReadOnlyDiagnosis =
    !requestDetailsLoaded || isLocked || isDeletionLocked || role === "hospital" || !!request?.referred_hospital_name;
  const isReadOnlyTreatment =
    !requestDetailsLoaded || isHospitalDirected || isLocked || isDeletionLocked;

  return (
    <div className="bg-white rounded-lg p-3 border border-slate-200 mb-2.5 space-y-3">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
        <div className="text-[11px] sm:text-xs font-medium text-slate-600 flex flex-wrap items-center gap-2">
          {request?.referred_hospital_name ? "Original Referral Diagnosis" : "Proposed Diagnosis"}
          {request?.referred_hospital_name && (
            <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-medium">
              Referral
            </span>
          )}
        </div>
        <div className="w-fit rounded-md bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {request?.diagnosis_code || "ICD-10"}
        </div>
      </div>

      <textarea
        className="w-full p-2.5 border border-slate-200 rounded-lg text-xs sm:text-[13px] font-semibold text-slate-900 bg-white min-h-[60px] focus:outline-none focus:ring-2 focus:ring-slate-500/30 placeholder:text-slate-400 disabled:opacity-80"
        placeholder={requestDetailsLoaded ? "Diagnosis..." : "Loading diagnosis..."}
        value={editDiagnosis}
        onChange={(e) => setEditDiagnosis(e.target.value)}
        readOnly={isReadOnlyDiagnosis}
      />

      <div className="text-[11px] sm:text-xs font-bold text-slate-700 uppercase tracking-wide flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
        {request?.referred_hospital_name ? "Current Treatment Request" : "Proposed Treatment"}
        {request?.referred_hospital_name && (
          <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-medium">
            Referred Hospital
          </span>
        )}
      </div>

      <textarea
        className="w-full p-2.5 border border-slate-200 rounded-lg text-xs sm:text-[13px] font-semibold text-slate-900 bg-white min-h-[76px] focus:outline-none focus:ring-2 focus:ring-slate-500/30 placeholder:text-slate-400 disabled:opacity-80"
        placeholder={requestDetailsLoaded ? "Treatment Plan..." : "Loading treatment..."}
        value={editTreatment}
        onChange={(e) => setEditTreatment(e.target.value)}
        onBlur={onBlurTreatment}
        readOnly={isReadOnlyTreatment}
      />

      {/* Referral details container */}
      <div className="space-y-2.5 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-2.5 mt-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] sm:text-xs font-medium text-slate-500">
              Referral Hospital / Claim Owner
            </div>
            <p className="mt-1 text-[11px] sm:text-[12px] text-slate-400">
              {referralCollapsed
                ? "Tap arrow to view referral details"
                : "Specify treating hospital details if this authorization requires a referral."}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setReferralCollapsed((current) => !current)}
            className="h-8 w-8 shrink-0 rounded-xl text-slate-600 hover:bg-slate-100"
          >
            {referralCollapsed ? (
              <ChevronDown className="h-4.5 w-4.5" />
            ) : (
              <ChevronUp className="h-4.5 w-4.5" />
            )}
          </Button>
        </div>

        {!referralCollapsed && (
          <div className="mt-3.5 space-y-3 animate-in fade-in duration-200">
            <HospitalReferralField
              label="Referral Hospital / Claim Owner"
              value={editReferralHospitalName}
              selectedId={editReferralHospitalId}
              excludeHospitalId={request?.requesting_hospital_id || request?.hospital_id}
              excludeHospitalName={request?.requesting_hospital_name || request?.hospital_name}
              onChange={(next) => {
                setEditReferralHospitalId(next.id);
                setEditReferralHospitalName(next.name);
              }}
              helperText="If this is a referral, the authorization code remains visible to the requester, but claim submission and payment belong only to this treating hospital."
              disabled={isLocked || isDeletionLocked || role === "hospital"}
            />
            {editReferralHospitalName.trim() ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-[11px] sm:text-[12px] font-bold leading-relaxed text-slate-500 shadow-sm break-words">
                Request raised by: {request?.requesting_hospital_name || request?.hospital_name || "Original hospital"}
                <br />
                Treatment and claims assigned to: {editReferralHospitalName.trim()}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] sm:text-[12px] font-semibold text-slate-400">
                No referral selected. Claims stay with {request?.hospital_name || "the requesting hospital"}.
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-4 items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <div className="space-y-1 min-w-0 flex-1">
            <span className="text-[11px] sm:text-xs font-medium text-slate-500">
              Requesting Hospital
            </span>
            <p className="text-[13px] sm:text-[14px] font-bold text-slate-800 mt-1 break-words [overflow-wrap:anywhere]">
              {request?.hospital_name || "N/A"}
            </p>
          </div>
          <div className="space-y-1 text-right shrink-0">
            <span className="text-[11px] sm:text-xs font-medium text-slate-500">
              Priority
            </span>
            <div>
              <Badge
                variant={request?.urgency === "urgent" ? "destructive" : "outline"}
                className="px-2 py-0.5 rounded-md uppercase text-[10px] font-black border-slate-200"
              >
                {request?.urgency || "ROUTINE"}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
