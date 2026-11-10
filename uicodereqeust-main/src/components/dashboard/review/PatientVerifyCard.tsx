import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Users } from "lucide-react";

interface FamilyMemberRecord {
  id?: string | null;
  full_name?: string | null;
  surname?: string | null;
  first_name?: string | null;
  relationship?: string | null;
  member_type?: string | null;
  beneficiary_number?: string | null;
  policy_number?: string | null;
}

function getFamilyMemberName(member: FamilyMemberRecord) {
  const fullName = String(member?.full_name || "").trim();
  if (fullName) return fullName;

  const fallbackName = [member?.surname, member?.first_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  return fallbackName || "Name unavailable";
}

interface PatientVerifyCardProps {
  request: any;
  checking: boolean;
  verificationLoadFailed?: boolean;
  onRetryVerification?: () => void;
  patientMatchStatus: 'exact' | 'partial' | 'none' | 'ambiguous' | 'conflict' | null;
  matchedMemberId: string | null;
  policyVerified: boolean | null;
  nhisVerified: boolean | null;
  familyMembers: FamilyMemberRecord[];
  earlyRefill: { isEarly: boolean; daysSince: number; lastDate: string } | null;
  requestPolicyNumber: string;
  primaryHospitalLoading?: boolean;
  primaryHospital?: any;
  primaryHospitalMismatch?: boolean;
  requestingHospitalName?: string;
  requestingHospitalCode?: string;
}

export function PatientVerifyCard({
  checking,
  verificationLoadFailed = false,
  onRetryVerification,
  patientMatchStatus,
  matchedMemberId,
  policyVerified,
  familyMembers,
  primaryHospital = null,
  primaryHospitalMismatch = false,
  requestingHospitalName = "",
  requestingHospitalCode = "",
}: PatientVerifyCardProps) {
  const [showFamily, setShowFamily] = useState(false);
  const matchedMember = familyMembers.find((member) => member.id === matchedMemberId);
  const familyCountLabel = `${familyMembers.length} ${familyMembers.length === 1 ? "member" : "members"}`;
  const identityRequiresReview = patientMatchStatus === "ambiguous" || patientMatchStatus === "conflict";

  return (
    <div className="w-full">
      {/* Primary Hospital */}
      <div className="bg-white rounded-xl p-2.5 sm:p-3 mb-2.5 border border-slate-100 shadow-sm">
        <div className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2">
          Primary Hospital
        </div>
        
        <div className="bg-emerald-50 rounded-xl p-2.5 sm:p-3 mb-2.5 border border-emerald-100">
          <div className="inline-block bg-emerald-500 text-white px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase">
            Primary
          </div>
          <div className="text-sm sm:text-base font-bold text-slate-800 mt-1.5 leading-tight">
            {primaryHospital?.hcp_name || primaryHospital?.hospital_name || requestingHospitalName || "Unknown Hospital"}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {primaryHospital?.state || "Unknown State"}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="min-w-0 bg-slate-50 rounded-lg p-1.5 sm:p-2 border border-slate-100">
            <div className="text-[10px] sm:text-[11px] font-medium text-slate-600">
              Hospital ID
            </div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-800 mt-0.5 break-words">
              {primaryHospital?.hcp_code || primaryHospital?.code || requestingHospitalCode || "N/A"}
            </div>
          </div>
          <div className="min-w-0 bg-slate-50 rounded-lg p-1.5 sm:p-2 border border-slate-100">
            <div className="text-[10px] sm:text-[11px] font-medium text-slate-600">
              Registration No
            </div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-800 mt-0.5 break-words">
              {primaryHospital?.registration_no || "N/A"}
            </div>
          </div>
          <div className="min-w-0 bg-slate-50 rounded-lg p-1.5 sm:p-2 border border-slate-100">
            <div className="text-[10px] sm:text-[11px] font-medium text-slate-600">
              Tier Level
            </div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-800 mt-0.5 break-words">
              {primaryHospital?.tier_level || "N/A"}
            </div>
          </div>
        </div>

        {primaryHospitalMismatch && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">Primary Hospital Mismatch</p>
              <p className="text-[11px] text-rose-600 mt-0.5 font-medium leading-relaxed">This request is from <span className="font-bold">{requestingHospitalName}</span>, which is not the patient's registered primary hospital.</p>
            </div>
          </div>
        )}
      </div>

      {/* NHIS Confirmation */}
      <div className="bg-white rounded-xl p-2.5 sm:p-3 mb-2.5 border border-slate-100 shadow-sm transition-all">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[12px] font-bold ${
              checking ? "border-slate-300 text-slate-400 animate-pulse" :
              verificationLoadFailed ? "border-rose-400 text-rose-500" :
              policyVerified && (patientMatchStatus === "exact" || (patientMatchStatus as string) === "matched") ? "border-green-500 text-green-500" :
              policyVerified && (patientMatchStatus === "partial" || identityRequiresReview) ? "border-yellow-500 text-yellow-500" :
              policyVerified ? "border-amber-500 text-amber-500" :
              "border-slate-300 text-slate-400"
            }`}>
              {checking ? "◓" : verificationLoadFailed ? "!" : policyVerified && (patientMatchStatus === "exact" || (patientMatchStatus as string) === "matched") ? "✓" : policyVerified ? "!" : "–"}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-extrabold text-slate-800">NHIS Confirmation</div>
              <div className={`text-[11px] ${verificationLoadFailed ? 'text-rose-600 font-semibold' : !policyVerified && !checking ? 'text-slate-500 font-medium' : policyVerified && (patientMatchStatus === 'none' || (patientMatchStatus as string) === 'mismatch' || identityRequiresReview) ? 'text-amber-600 font-bold' : policyVerified ? 'text-green-600 font-semibold' : 'text-slate-400'}`}>
                {checking ? "Checking registry..." :
                 verificationLoadFailed ? "Could not check registry. Please retry." :
                 policyVerified && (patientMatchStatus === "exact" || (patientMatchStatus as string) === "matched") ? "Verified master records registry" :
                 policyVerified && identityRequiresReview ? "Policy found, identity needs review" :
                 policyVerified && patientMatchStatus === "ambiguous" ? "Multiple family members match; review required" :
                 policyVerified && patientMatchStatus === "conflict" ? "Beneficiary ID and name conflict; review required" :
                 policyVerified && patientMatchStatus === "partial" ? "Partial match in registry" :
                 policyVerified && (patientMatchStatus === "none" || (patientMatchStatus as string) === "mismatch") ? "Policy found, patient name mismatch" :
                 policyVerified ? "Verified master records registry" :
                 "Not found in active registry"}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {verificationLoadFailed && onRetryVerification && (
              <button type="button" onClick={onRetryVerification} className="text-[10px] font-bold text-rose-700 underline underline-offset-2">
                Retry registry check
              </button>
            )}
            <button
              type="button"
              aria-expanded={showFamily}
              aria-controls="nhis-family-details"
              aria-label={`${showFamily ? "Hide" : "Show"} family member names for ${familyCountLabel}`}
              onClick={() => setShowFamily((visible) => !visible)}
              disabled={familyMembers.length === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-left text-xs font-semibold text-emerald-900 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
            >
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 font-bold tabular-nums text-emerald-800">
                {familyMembers.length}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span>{familyCountLabel} on policy</span>
                <span className="mt-0.5 text-[10px] font-medium text-emerald-800/75">
                  {showFamily ? "Hide member list" : "Tap to view member names"}
                </span>
              </span>
              {showFamily ? <ChevronUp aria-hidden="true" className="ml-1 h-4 w-4 shrink-0" /> : <ChevronDown aria-hidden="true" className="ml-1 h-4 w-4 shrink-0" />}
            </button>
          </div>
        </div>
          {matchedMember?.beneficiary_number && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-[10px] font-medium text-slate-500">Matched beneficiary</span>
              <span className="font-mono text-xs font-semibold text-slate-800">{matchedMember.beneficiary_number}</span>
              <span className="text-[10px] text-slate-500">Family policy {matchedMember.policy_number}</span>
            </div>
          )}

        <div id="nhis-family-details" hidden={!showFamily} className="mt-3 border-t border-slate-100 pt-3 animate-in fade-in duration-200">
          <section aria-label="Family members on this policy" className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Users aria-hidden="true" className="h-4 w-4 text-emerald-700" />
                <span>Family members on this policy</span>
              </div>
              <span className="text-[10px] font-medium text-slate-500">{familyCountLabel}</span>
            </div>
            {familyMembers.length === 0 && (
              <p className="mt-2 rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-[11px] text-slate-600">
                {checking ? "Family names will appear after the registry check." : verificationLoadFailed ? "The family roster is unavailable until the registry check succeeds." : "No family members were found for this policy."}
              </p>
            )}
          {familyMembers.length > 0 && (
            <ul className="mt-2 space-y-2">
              {familyMembers.map((member, index) => {
                const isMatch = Boolean(matchedMemberId && member.id === matchedMemberId);
                const memberName = getFamilyMemberName(member);
                const key = member.id || member.beneficiary_number || `${memberName}-${index}`;
                return (
                  <li key={key} className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border p-3 ${isMatch ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                    <div className="min-w-0">
                      <span className="mb-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {member.relationship || member.member_type || "Member"}
                      </span>
                      <div className="break-words text-[13px] font-bold text-slate-800 [overflow-wrap:anywhere]">{memberName}</div>
                    </div>
                    {isMatch && <span className="shrink-0 rounded-full bg-emerald-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Request</span>}
                  </li>
                );
              })}
            </ul>
          )}
          </section>
            <div className={`flex items-start gap-2 p-3 rounded-xl mb-2 border ${verificationLoadFailed ? 'bg-rose-50 border-rose-100' : policyVerified ? (patientMatchStatus === 'none' ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100') : 'bg-red-50 border-red-100'}`}>
              <div className={`text-[16px] mt-0.5 ${policyVerified ? (patientMatchStatus === 'none' ? 'text-amber-500' : 'text-green-500') : 'text-red-500'}`}>
                {policyVerified ? (patientMatchStatus === 'none' ? "!" : "✓") : "✗"}
              </div>
              <div>
                <strong className={`text-[12px] sm:text-[13px] block ${policyVerified ? (patientMatchStatus === 'none' ? 'text-amber-800' : 'text-slate-800') : 'text-red-800'}`}>
                  {verificationLoadFailed ? "Policy lookup failed:" : policyVerified ? "Policy number matched:" : "Policy number NOT found:"}
                </strong>
                <p className={`text-[11px] sm:text-[12px] mt-0.5 ${policyVerified ? (patientMatchStatus === 'none' ? 'text-amber-700' : 'text-slate-500') : 'text-red-600'}`}>
                  {verificationLoadFailed ? "The registry could not be reached. Retry the check before treating this as missing." : policyVerified ? "Exact policy found in monthly NHIS Accredited List." : "This policy number is not in the active NHIS registry."}
                </p>
              </div>
            </div>

            <div className={`flex items-start gap-2 p-3 rounded-xl mb-2 border ${patientMatchStatus === 'exact' ? 'bg-slate-50 border-slate-100' : patientMatchStatus === 'partial' || identityRequiresReview ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100'}`}>
              <div className={`text-[16px] mt-0.5 ${patientMatchStatus === 'exact' ? 'text-green-500' : patientMatchStatus === 'partial' || identityRequiresReview ? 'text-yellow-500' : 'text-red-500'}`}>
                {patientMatchStatus === 'exact' ? "✓" : "!"}
              </div>
              <div>
                <strong className={`text-[12px] sm:text-[13px] block ${patientMatchStatus === 'exact' ? 'text-slate-800' : patientMatchStatus === 'partial' || identityRequiresReview ? 'text-yellow-800' : 'text-red-800'}`}>
                  {patientMatchStatus === 'exact' ? "Patient identity matched:" : patientMatchStatus === 'ambiguous' ? "Multiple possible members:" : patientMatchStatus === 'conflict' ? "Beneficiary details conflict:" : patientMatchStatus === 'partial' ? "Patient name partial match:" : "Patient name mismatch:"}
                </strong>
                <p className={`text-[11px] sm:text-[12px] mt-0.5 ${patientMatchStatus === 'exact' ? 'text-slate-500' : patientMatchStatus === 'partial' || identityRequiresReview ? 'text-yellow-700' : 'text-red-600'}`}>
                  {patientMatchStatus === 'exact' ? "The complete name matches one member in this policy." : patientMatchStatus === 'ambiguous' ? "More than one member matches. Do not select automatically; review the beneficiary details." : patientMatchStatus === 'conflict' ? "The member number and name do not identify the same person. Review the request before proceeding." : patientMatchStatus === 'partial' ? "Name is similar but not an exact match." : "Name does not match any records for this policy."}
                </p>
              </div>
            </div>

        </div>
      </div></div>
  );
}
