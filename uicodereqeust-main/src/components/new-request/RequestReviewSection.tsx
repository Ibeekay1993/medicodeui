import { CheckCircle2, FileText } from "lucide-react";
import { TreatmentItem } from "@/lib/new-request-helpers";

interface RequestReviewSectionProps {
  selectedPatient: { full_name: string; policy_number: string } | null;
  phone: string;
  patientEmail: string;
  noEmail: boolean;
  diagnoses: string[];
  urgency: string;
  doctorReportName: string | null;
  treatments: TreatmentItem[];
  referralHospitalId: string | null;
  referralHospitalName: string;
  total: number;
}

export default function RequestReviewSection({
  selectedPatient,
  phone,
  patientEmail,
  noEmail,
  diagnoses,
  urgency,
  doctorReportName,
  treatments,
  referralHospitalId,
  referralHospitalName,
  total,
}: RequestReviewSectionProps) {
  const isReferral = Boolean(
    referralHospitalId || (referralHospitalName && referralHospitalName.trim().length > 0)
  );

  const showEmail =
    !noEmail &&
    patientEmail &&
    patientEmail !== "no-email@ronsbergerhmo.io" &&
    !patientEmail.startsWith("no-email@") &&
    !patientEmail.endsWith("@medicode.com");

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="border-b border-slate-100 pb-2.5">
        <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Review Authorization Request
        </h3>
        <p className="text-[11px] text-slate-500">
          Verify enrollee details, clinical diagnoses, and tariff items before submitting
        </p>
      </div>

      <div className="bg-slate-50 p-4 rounded-xl border border-slate-300 space-y-3 text-xs">
        <div className="flex justify-between items-start gap-2">
          <span className="text-slate-700 font-semibold">Patient:</span>
          <span className="font-bold text-slate-900 text-right">
            {selectedPatient?.full_name} ({selectedPatient?.policy_number})
          </span>
        </div>
        <div className="flex justify-between items-start gap-2">
          <span className="text-slate-700 font-semibold">Contact:</span>
          <span className="font-bold text-slate-900 text-right">
            {phone} {showEmail ? ` · ${patientEmail}` : ""}
          </span>
        </div>
        <div className="flex justify-between items-start gap-2">
          <span className="text-slate-700 font-semibold">Diagnoses:</span>
          <span className="font-bold text-slate-900 text-right">{diagnoses.join(", ")}</span>
        </div>
        <div className="flex justify-between items-center gap-2">
          <span className="text-slate-700 font-semibold">Urgency:</span>
          <span className="font-bold capitalize text-slate-900">{urgency}</span>
        </div>
        <div className="flex justify-between items-center gap-2">
          <span className="text-slate-700 font-semibold">Doctor Report:</span>
          <span className="font-bold text-slate-900 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-emerald-600" />
            {doctorReportName || "None attached"}
          </span>
        </div>

        {treatments.length > 0 && (
          <div className="pt-2.5 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-900">
                Selected Tariff Items ({treatments.length})
              </span>
            </div>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
              {treatments.map((t, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center text-xs border border-slate-200 rounded-lg p-2.5 bg-white shadow-xs"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-bold text-slate-900 truncate">{t.name}</p>
                    <p className="text-[11px] text-slate-700 font-mono font-medium">
                      {t.code} · {t.category || "Service"}
                    </p>
                  </div>
                  <div className="text-right whitespace-nowrap shrink-0">
                    {!isReferral ? (
                      <div>
                        <p className="text-[11px] text-slate-700 font-medium">
                          {t.quantity} × ₦{Number(t.amount).toLocaleString("en-NG")}
                        </p>
                        <p className="font-mono font-bold text-slate-900 text-xs">
                          ₦{(t.quantity * Number(t.amount)).toLocaleString("en-NG")}
                        </p>
                      </div>
                    ) : (
                      <p className="font-bold text-slate-900">Qty: {t.quantity}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isReferral && (
          <div className="flex justify-between items-center border-t border-slate-300 pt-3 mt-2">
            <span className="font-bold text-slate-900 text-sm">Total Requested Amount:</span>
            <span className="font-mono font-black text-emerald-700 text-base">
              ₦{total.toLocaleString("en-NG")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
