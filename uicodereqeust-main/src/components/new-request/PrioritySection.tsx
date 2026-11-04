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
        <span className="text-[11px] text-slate-500 capitalize">Current: {urgency}</span>
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
                "h-8 sm:h-9 rounded-lg text-xs font-semibold capitalize border transition-colors",
                isSelected
                  ? u === "emergency"
                    ? "bg-rose-50 text-rose-800 border-rose-300 ring-1 ring-rose-400"
                    : u === "urgent"
                    ? "bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-400"
                    : "bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-400"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
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
