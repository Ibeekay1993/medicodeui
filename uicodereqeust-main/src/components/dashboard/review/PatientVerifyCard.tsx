import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { cleanPatientName } from "@/lib/clinicalUtils";

interface PatientVerifyCardProps {
  request: any;
  checking: boolean;
  patientMatchStatus: "exact" | "partial" | "none" | null;
  matchedMemberId?: string | null;
  policyVerified: boolean | null;
  nhisVerified: boolean | null;
  familyMembers: any[];
  earlyRefill: { isEarly: boolean; daysSince: number; lastDate: string } | null;
  requestPolicyNumber: string;
  requestPatientName: string;
}

export function PatientVerifyCard({
  request: _request,
  checking,
  patientMatchStatus,
  matchedMemberId,
  policyVerified,
  nhisVerified,
  familyMembers,
  earlyRefill,
  requestPolicyNumber: _requestPolicyNumber,
  requestPatientName: _requestPatientName,
}: PatientVerifyCardProps) {
  const [nhisCollapsed, setNhisCollapsed] = useState(true);

  if (checking) {
    return (
      <div className="flex items-center gap-3 text-slate-500 text-sm p-4 bg-slate-50/50 border border-slate-100 rounded-2xl animate-pulse">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="font-semibold tracking-tight">Syncing Hospital Registry Data…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Identity Mismatch Warnings */}
      {patientMatchStatus === "partial" && (
        <div className="p-4 rounded-2xl text-xs border border-amber-200 bg-amber-50/70 flex items-start gap-3 text-amber-900 shadow-sm animate-in slide-in-from-top-2 duration-300">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-black uppercase tracking-wider text-xs text-amber-800">Identity Mismatch Found</p>
            <p className="font-medium mt-1 text-amber-900/80">Patient name partially matched (surname). Please verify the member card carefully.</p>
          </div>
        </div>
      )}

      {patientMatchStatus === "none" && (
        <div className="p-4 rounded-2xl text-xs border border-rose-200 bg-rose-50/70 flex items-start gap-3 text-rose-900 shadow-sm animate-in slide-in-from-top-2 duration-300">
          <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-black uppercase tracking-wider text-xs text-rose-800">Patient Not Found</p>
            <p className="font-medium mt-1 text-rose-900/80">The requested name does not match any principal or dependent records for this policy.</p>
          </div>
        </div>
      )}

      {/* NHIS Confirmation Details dropdown */}
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/40 to-emerald-50/80 shadow-sm overflow-hidden transition-all duration-300">
        <button
          type="button"
          onClick={() => setNhisCollapsed(!nhisCollapsed)}
          className="w-full text-left px-4 py-3 border-b border-emerald-100 flex items-center justify-between hover:bg-emerald-100/20 active:bg-emerald-100/40 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-emerald-800">NHIS Confirmation</p>
              <p className="text-xs font-medium text-emerald-900/60 mt-0.5">Verified master records registry</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-black uppercase bg-white border-emerald-200 text-emerald-700 shadow-sm">
              {familyMembers.length} family member{familyMembers.length !== 1 ? "s" : ""}
            </Badge>
            {nhisCollapsed ? (
              <ChevronDown className="w-4 h-4 text-emerald-600" />
            ) : (
              <ChevronUp className="w-4 h-4 text-emerald-600" />
            )}
          </div>
        </button>

        {!nhisCollapsed && (
          <div className="p-4 space-y-3 animate-in fade-in duration-200">
            {nhisVerified === true ? (
              <div className="p-3 rounded-xl text-xs border border-emerald-200 bg-white/70 flex items-center gap-2.5 text-emerald-800 shadow-sm">
                <ShieldCheck className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                {policyVerified ? (
                  <span><strong>Policy number matched:</strong> Exact policy found in monthly NHIS Accredited List.</span>
                ) : (
                  <span><strong>Patient matched by name:</strong> Record found in monthly NHIS Accredited List.</span>
                )}
              </div>
            ) : nhisVerified === false ? (
              <div className="p-3 rounded-xl text-xs border border-rose-100 bg-white/70 flex items-center gap-2.5 text-rose-800 shadow-sm">
                <XCircle className="w-4.5 h-4.5 text-rose-500 shrink-0" />
                <span><strong>Not on NHIS List:</strong> Policy number was not found in monthly NHIS Accredited List.</span>
              </div>
            ) : null}

            {patientMatchStatus === "exact" && (
              <div className="p-3 rounded-xl text-xs border border-emerald-200 bg-white/70 flex items-center gap-2.5 text-emerald-800 shadow-sm">
                <ShieldCheck className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                <span><strong>Patient name matched exactly:</strong> Name matches principal/dependent records.</span>
              </div>
            )}

            {familyMembers.length > 0 && (
              <div className="mt-3.5 space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-emerald-800/60 mb-1 pl-1">Policy Family Tree</p>
                <div className="grid grid-cols-1 gap-2">
                  {familyMembers.map((member: any) => {
                    const isMatched = member.id === matchedMemberId;
                    return (
                      <div key={member.id} className={`flex flex-col gap-1.5 rounded-xl p-3 shadow-xs transition-colors ${
                        isMatched ? "bg-emerald-50/50 border-2 border-emerald-400" : "bg-white/90 border border-emerald-100/60 hover:border-emerald-200"
                      }`}>
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <Badge variant="outline" className="text-xs font-black uppercase bg-emerald-50 border-emerald-200 text-emerald-700">
                              {member.role || "MEMBER"}
                            </Badge>
                            <span className="text-xs font-bold text-slate-800">{cleanPatientName(member.full_name || `${member.surname || ""} ${member.first_name || ""}`)}</span>
                          </div>
                          {isMatched && (
                            <Badge className="text-[10px] font-black uppercase bg-emerald-500 text-white border-none shadow-sm flex items-center gap-1 px-1.5 py-0.5 mt-0.5">
                              <ShieldCheck className="w-3 h-3" /> Matched Patient
                            </Badge>
                          )}
                        </div>
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${isMatched ? "text-emerald-700/60" : "text-slate-400"}`}>
                          {member.phone ? `☎ ${member.phone}` : "No phone"} {member.date_of_birth ? `• DOB: ${new Date(member.date_of_birth).toLocaleDateString("en-GB")}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 30-day early refill check */}
      {earlyRefill?.isEarly && (
        <div className="p-4 rounded-2xl text-xs border border-rose-200 bg-rose-50/70 flex items-start gap-3 text-rose-800 shadow-sm animate-in zoom-in-95 duration-200">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-black uppercase tracking-wider text-xs text-rose-800">30-Day Refill Warning</p>
            <p className="font-semibold mt-1">
              Last request approved only {earlyRefill.daysSince} days ago (on {new Date(earlyRefill.lastDate).toLocaleDateString("en-GB")}).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
