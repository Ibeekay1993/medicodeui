import { HospitalReferralField } from "@/components/HospitalReferralField";

interface ReferralSectionProps {
  hospitalName: string;
  referralHospitalName: string;
  referralHospitalId: string | null;
  setReferralHospitalId: (id: string | null) => void;
  setReferralHospitalName: (name: string) => void;
}

export default function ReferralSection({
  hospitalName,
  referralHospitalName,
  referralHospitalId,
  setReferralHospitalId,
  setReferralHospitalName
}: ReferralSectionProps) {
  return (
    <div className="p-6 space-y-3">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Referral Ownership</p>
      <HospitalReferralField
        value={referralHospitalName}
        selectedId={referralHospitalId}
        onChange={(next) => {
          setReferralHospitalId(next.id);
          setReferralHospitalName(next.name);
        }}
        helperText="Leave blank if your hospital will treat and claim. If referred, the treating hospital owns claim submission and payment."
      />
      {referralHospitalName.trim() ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold leading-relaxed text-blue-800">
          Request raised by: {hospitalName || "Your hospital"}
          <br />
          Treatment and claims assigned to: {referralHospitalName.trim()}
        </div>
      ) : null}
    </div>
  );
}
