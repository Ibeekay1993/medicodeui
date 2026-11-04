import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

interface PrioritySectionProps {
  urgency: string;
  setUrgency: (val: "routine" | "urgent" | "emergency") => void;
}

export default function PrioritySection({
  urgency,
  setUrgency
}: PrioritySectionProps) {
  return (
    <div className="p-4 sm:p-5 space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 id="priority-group-label" className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-emerald-600" /> Clinical Urgency
        </h4>
        <span className="text-xs font-semibold text-slate-700 capitalize">Current: {urgency}</span>
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="priority-group-label">
        {(["routine", "urgent", "emergency"] as const).map((u) => {
          const isSelected = urgency === u;
          return (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setUrgency(u)}
              className={cn(
                "h-9 sm:h-10 rounded-lg text-xs font-bold capitalize border transition-all shadow-xs",
                isSelected
                  ? u === "emergency"
                    ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                    : u === "urgent"
                    ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                    : "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400 font-semibold"
              )}
            >
              {u}
            </button>
          );
        })}
      </div>
    </div>
  );
}
