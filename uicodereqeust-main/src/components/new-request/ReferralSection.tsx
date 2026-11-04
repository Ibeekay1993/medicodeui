import { HospitalReferralField } from "@/components/HospitalReferralField";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect } from "react";
import { Share2 } from "lucide-react";

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
    <div className="p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Share2 className="h-3.5 w-3.5 text-emerald-600" /> Referral Routing
        </h4>
        <span className="text-[11px] text-slate-500">Optional specialist transfer</span>
      </div>
      
      <div className="flex items-center space-x-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 transition-colors hover:bg-slate-50">
        <Checkbox 
          id="referral-toggle" 
          checked={isReferral}
          onCheckedChange={(checked) => setIsReferral(!!checked)}
          className="h-4 w-4 min-h-[16px] min-w-[16px] max-h-[16px] max-w-[16px] shrink-0 flex-none rounded"
        />
        <label
          htmlFor="referral-toggle"
          className="text-xs font-medium leading-none cursor-pointer select-none text-slate-800"
        >
          Refer this patient case to an external or specialist facility
        </label>
      </div>

      {isReferral && (
        <div className="mt-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <HospitalReferralField
            value={referralHospitalName}
            selectedId={referralHospitalId}
            excludeHospitalId={hospitalId}
            excludeHospitalName={hospitalName}
            onChange={(next) => {
              setReferralHospitalId(next.id);
              setReferralHospitalName(next.name);
            }}
            helperText="The selected facility will receive the referral and claim authorization."
          />
          {referralHospitalName.trim() ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-2.5 text-xs text-blue-900 leading-relaxed">
              <span className="font-semibold">Case Origin:</span> {hospitalName || "Your hospital"}<br />
              <span className="font-semibold">Treating Provider:</span> {referralHospitalName.trim()}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
