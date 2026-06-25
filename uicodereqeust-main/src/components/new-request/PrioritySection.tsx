import { cn } from "@/lib/utils";

interface PrioritySectionProps {
  urgency: string;
  setUrgency: (val: "routine" | "urgent" | "emergency") => void;
}

export default function PrioritySection({
  urgency,
  setUrgency
}: PrioritySectionProps) {
  return (
    <div className="p-6 space-y-3">
      <p id="priority-group-label" className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Priority</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="priority-group-label">
        {(["routine", "urgent", "emergency"] as const).map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={urgency === u}
            onClick={() => setUrgency(u)}
            className={cn(
              "h-11 rounded-xl text-xs font-black uppercase tracking-widest border transition-all",
              urgency === u
                ? u === "emergency"
                  ? "bg-rose-600 text-white border-rose-600 shadow-md"
                  : u === "urgent"
                  ? "bg-amber-500 text-white border-amber-500 shadow-md"
                  : "bg-emerald-600 text-white border-emerald-600 shadow-md"
                : "bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300"
            )}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  );
}
