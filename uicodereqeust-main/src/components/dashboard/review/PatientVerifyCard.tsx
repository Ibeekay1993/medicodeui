import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronUp, Check, AlertTriangle } from "lucide-react";
import { cleanPatientName } from "@/lib/clinicalUtils";

interface PatientVerifyCardProps {
  request: any;
  checking: boolean;
  patientMatchStatus: 'checking' | 'matched' | 'mismatch' | 'not_found' | 'error';
  matchedMemberId: string | null;
  policyVerified: boolean;
  nhisVerified: boolean;
  familyMembers: any[];
  earlyRefill: { isEarly: boolean; daysSinceLast: number | null; lastApprovalDate: string | null };
  requestPatientName: string;
  requestPolicyNumber: string;
  primaryHospitalLoading?: boolean;
  primaryHospital?: any;
  primaryHospitalMismatch?: boolean;
  requestingHospitalName?: string;
  requestingHospitalCode?: string;
}

export function PatientVerifyCard({
  request,
  checking,
  patientMatchStatus,
  matchedMemberId,
  policyVerified,
  nhisVerified,
  familyMembers,
  earlyRefill,
  requestPatientName,
  requestPolicyNumber,
  primaryHospitalLoading = false,
  primaryHospital = null,
  primaryHospitalMismatch = false,
  requestingHospitalName = "",
  requestingHospitalCode = "",
}: PatientVerifyCardProps) {
  const [showFamily, setShowFamily] = useState(false);

  return (
    <div className="w-full">
      {/* Primary Hospital */}
      <div className="bg-white rounded-2xl p-4 mb-3 border border-slate-100 shadow-sm">
        <div className="text-[13px] sm:text-[14px] font-extrabold text-slate-800 uppercase tracking-wide mb-3">
          Primary Hospital
        </div>
        
        <div className="bg-emerald-50 rounded-2xl p-4 sm:p-5 mb-3 border border-emerald-100">
          <div className="inline-block bg-emerald-500 text-white px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase">
            Primary
          </div>
          <div className="text-[16px] sm:text-[18px] font-extrabold text-slate-800 mt-2 leading-tight">
            {primaryHospital?.hcp_name || primaryHospital?.hospital_name || requestingHospitalName || "Unknown Hospital"}
          </div>
          <div className="text-[12px] text-slate-500 mt-1">
            {primaryHospital?.state || "Unknown State"}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              Hospital ID
            </div>
            <div className="text-[13px] sm:text-[14px] font-bold text-slate-800 mt-1">
              {primaryHospital?.hcp_code || primaryHospital?.code || requestingHospitalCode || "N/A"}
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              Registration No
            </div>
            <div className="text-[13px] sm:text-[14px] font-bold text-slate-800 mt-1">
              {primaryHospital?.registration_no || "N/A"}
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide">
              Tier Level
            </div>
            <div className="text-[13px] sm:text-[14px] font-bold text-slate-800 mt-1">
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
      <div className="bg-white rounded-2xl p-4 mb-3 border border-slate-100 shadow-sm transition-all">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[12px] font-bold ${
              checking ? "border-slate-300 text-slate-400" :
              policyVerified && patientMatchStatus === "exact" ? "border-green-500 text-green-500" :
              policyVerified && patientMatchStatus === "partial" ? "border-yellow-500 text-yellow-500" :
              policyVerified && patientMatchStatus === "none" ? "border-red-500 text-red-500" :
              "border-red-500 text-red-500"
            }`}>
              {checking ? "◓" : policyVerified && patientMatchStatus === "exact" ? "✓" : "!"}
            </div>
            <div>
              <div className="text-[13px] font-extrabold text-slate-800">NHIS Confirmation</div>
              <div className={`text-[11px] ${!policyVerified && !checking ? 'text-red-500 font-bold' : policyVerified && patientMatchStatus === 'none' ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                {checking ? "Checking registry..." :
                 policyVerified && patientMatchStatus === "exact" ? "Verified master records registry" :
                 policyVerified && patientMatchStatus === "partial" ? "Partial match in registry" :
                 policyVerified && patientMatchStatus === "none" ? "Policy found, patient name mismatch" :
                 "Not found in registry"}
              </div>
            </div>
          </div>
          <div 
            className="bg-slate-100 px-3 py-1.5 rounded-full text-[11px] font-bold text-slate-500 flex items-center gap-1 cursor-pointer hover:bg-slate-200 transition-colors"
            onClick={() => setShowFamily(!showFamily)}
          >
            {familyMembers.length || 0} FAMILY MEMBERS {showFamily ? '▴' : '▾'}
          </div>
        </div>

        {showFamily && (
          <div className="mt-3 border-t border-slate-100 pt-3 animate-in fade-in duration-200">
            <div className={`flex items-start gap-2 p-3 rounded-xl mb-2 border ${policyVerified ? (patientMatchStatus === 'none' ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100') : 'bg-red-50 border-red-100'}`}>
              <div className={`text-[16px] mt-0.5 ${policyVerified ? (patientMatchStatus === 'none' ? 'text-amber-500' : 'text-green-500') : 'text-red-500'}`}>
                {policyVerified ? (patientMatchStatus === 'none' ? "!" : "✓") : "✗"}
              </div>
              <div>
                <strong className={`text-[12px] sm:text-[13px] block ${policyVerified ? (patientMatchStatus === 'none' ? 'text-amber-800' : 'text-slate-800') : 'text-red-800'}`}>
                  {policyVerified ? "Policy number matched:" : "Policy number NOT found:"}
                </strong>
                <p className={`text-[11px] sm:text-[12px] mt-0.5 ${policyVerified ? (patientMatchStatus === 'none' ? 'text-amber-700' : 'text-slate-500') : 'text-red-600'}`}>
                  {policyVerified ? "Exact policy found in monthly NHIS Accredited List." : "This policy number is not in the active NHIS registry."}
                </p>
              </div>
            </div>

            <div className={`flex items-start gap-2 p-3 rounded-xl mb-2 border ${patientMatchStatus === 'exact' ? 'bg-slate-50 border-slate-100' : patientMatchStatus === 'partial' ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100'}`}>
              <div className={`text-[16px] mt-0.5 ${patientMatchStatus === 'exact' ? 'text-green-500' : patientMatchStatus === 'partial' ? 'text-yellow-500' : 'text-red-500'}`}>
                {patientMatchStatus === 'exact' ? "✓" : "!"}
              </div>
              <div>
                <strong className={`text-[12px] sm:text-[13px] block ${patientMatchStatus === 'exact' ? 'text-slate-800' : patientMatchStatus === 'partial' ? 'text-yellow-800' : 'text-red-800'}`}>
                  {patientMatchStatus === 'exact' ? "Patient name matched exactly:" : patientMatchStatus === 'partial' ? "Patient name partial match:" : "Patient name mismatch:"}
                </strong>
                <p className={`text-[11px] sm:text-[12px] mt-0.5 ${patientMatchStatus === 'exact' ? 'text-slate-500' : patientMatchStatus === 'partial' ? 'text-yellow-700' : 'text-red-600'}`}>
                  {patientMatchStatus === 'exact' ? "Name matches principal/dependent records." : patientMatchStatus === 'partial' ? "Name is similar but not an exact match." : "Name does not match any records for this policy."}
                </p>
              </div>
            </div>

            <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide my-3 px-1">
              Policy Family Tree
            </div>
            
            {familyMembers.length > 0 ? (
              familyMembers.map((member, idx) => {
                const isMatch = member.id === matchedMemberId || member.full_name === requestPatientName;
                return (
                  <div key={idx} className={`flex items-center justify-between p-3 rounded-xl mb-2 border transition-all ${isMatch ? 'bg-green-50 border-green-500 border-2 shadow-sm' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                    <div className="flex items-center gap-2">
                      <div>
                        <div className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase inline-block mb-1 ${isMatch ? 'bg-green-200 text-green-800' : 'bg-slate-200 text-slate-500'}`}>
                          {member.relationship || "Member"}
                        </div>
                        <div className="text-[13px] sm:text-[14px] font-bold text-slate-800">
                          {member.full_name}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                          {member.phone || "NO PHONE"}
                        </div>
                      </div>
                    </div>
                    {isMatch && (
                      <div className="bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider flex items-center gap-1 shadow-sm">
                        <span className="text-[12px]">✓</span> Matched
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-[12px] font-semibold text-slate-400 p-4 bg-slate-50 rounded-xl text-center border border-slate-100 border-dashed">
                No family members found for this policy.
              </div>
            )}
          </div>
        )}
      </div></div>
  );
}
