import { HospitalReferralField } from "@/components/HospitalReferralField";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect } from "react";

interface ReferralSectionProps {
  hospitalName: string;
  hospitalId?: string | null;
  referralHospitalName: string;
  referralHospitalId: string | null;
  setReferralHospitalId: (id: string | null) => void;
  setReferralHospitalName: (name: string) => void;
}

export default function ReferralSection({
  hospitalName,
  hospitalId,
  referralHospitalName,
  referralHospitalId,
  setReferralHospitalId,
  setReferralHospitalName
}: ReferralSectionProps) {
  const [isReferral, setIsReferral] = useState(!!referralHospitalName.trim());

  useEffect(() => {
    if (!isReferral) {
      setReferralHospitalId(null);
      setReferralHospitalName("");
    }
  }, [isReferral, setReferralHospitalId, setReferralHospitalName]);

  return (
    <div className="p-6 space-y-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Referral Ownership</p>
      
      <div className="flex items-center space-x-3 mb-2 rounded-lg border border-slate-100 bg-slate-50 p-4 transition-colors hover:bg-slate-100/50">
        <Checkbox 
          id="referral-toggle" 
          checked={isReferral}
          onCheckedChange={(checked) => setIsReferral(!!checked)}
          className="h-4 w-4 min-h-[16px] min-w-[16px] max-h-[16px] max-w-[16px] shrink-0 flex-none"
        />
        <label
          htmlFor="referral-toggle"
          className="text-sm font-medium leading-none cursor-pointer select-none text-slate-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Is this a referral to another hospital?
        </label>
      </div>

      {isReferral && (
        <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <HospitalReferralField
            value={referralHospitalName}
            selectedId={referralHospitalId}
            excludeHospitalId={hospitalId}
            excludeHospitalName={hospitalName}
            onChange={(next) => {
              setReferralHospitalId(next.id);
              setReferralHospitalName(next.name);
            }}
            helperText="The treating hospital you select will own claim submission and payment."
          />
          {referralHospitalName.trim() ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-xs font-bold leading-relaxed text-slate-700">
              Request raised by: {hospitalName || "Your hospital"}
              <br />
              Treatment and claims assigned to: {referralHospitalName.trim()}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
