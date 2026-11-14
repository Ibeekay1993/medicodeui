import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClaimStatusMetricCardProps {
  label: string;
  count: number;
  value: string;
  Icon: LucideIcon;
  iconBg: string;
  activeBorder: string;
  selected: boolean;
  onSelect: () => void;
}

export function ClaimStatusMetricCard({
  label,
  count,
  value,
  Icon,
  iconBg,
  activeBorder,
  selected,
  onSelect,
}: ClaimStatusMetricCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Filter by ${label}: ${count} claims, claim value ${value}`}
      onClick={onSelect}
      className={cn(
        "group flex min-w-0 cursor-pointer items-start gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xs transition-all hover:border-slate-300 hover:shadow-sm sm:p-3.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        selected ? cn(activeBorder, "bg-slate-50/40") : "hover:bg-slate-50/30",
      )}
    >
      <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 transition-transform group-hover:scale-105", iconBg)}>
        <Icon aria-hidden="true" className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-slate-600 tracking-tight">{label}</span>
        <span className="mt-1 flex items-baseline gap-1">
          <span className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl font-mono leading-tight">{count}</span>
          <span className="text-[11px] font-medium text-slate-500 sm:text-xs">claims</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] font-medium text-slate-600 [overflow-wrap:anywhere] sm:text-xs">
          <span className="text-slate-400">Claim value</span>
          <span className="font-semibold text-slate-900 font-mono">{value}</span>
        </span>
      </span>
    </button>
  );
}

