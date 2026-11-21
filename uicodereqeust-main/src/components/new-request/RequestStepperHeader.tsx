import { CheckCircle2 } from "lucide-react";

interface RequestStepperHeaderProps {
  step: number;
}

const STEPS = [
  { num: 1, label: "Patient" },
  { num: 2, label: "Diagnosis" },
  { num: 3, label: "Treatment" },
  { num: 4, label: "Documents" },
  { num: 5, label: "Review" },
];

export default function RequestStepperHeader({ step }: RequestStepperHeaderProps) {
  return (
    <div className="mb-5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-3.5">
      <div className="grid grid-cols-5 gap-2">
        {STEPS.map(({ num, label }) => (
          <div key={num} className="flex flex-col items-center text-center">
            <div
              className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                step === num
                  ? "bg-slate-900 text-white shadow-sm ring-2 ring-emerald-500 ring-offset-2"
                  : step > num
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              {step > num ? <CheckCircle2 className="h-4 w-4" /> : num}
            </div>
            <span
              className={`mt-1 text-[10px] sm:text-[11px] font-semibold truncate ${
                step === num
                  ? "text-slate-900 font-bold"
                  : step > num
                  ? "text-emerald-800 font-bold"
                  : "text-slate-600 font-medium"
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
