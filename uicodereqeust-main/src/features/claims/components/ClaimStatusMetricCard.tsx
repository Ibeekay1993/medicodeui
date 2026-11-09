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
        "flex min-w-0 cursor-pointer items-start gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:shadow sm:p-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        selected && activeBorder,
      )}
    >
      <span className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11", iconBg)}>
        <Icon aria-hidden="true" className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-slate-600">{label}</span>
        <span className="mt-1 block text-base font-bold leading-tight tracking-tight text-slate-900 sm:text-lg">
          {count}{" "}<span className="text-[11px] font-medium text-slate-500 sm:text-xs">claims</span>
        </span>
        <span className="mt-1 block break-words text-[11px] leading-tight text-slate-600 [overflow-wrap:anywhere] sm:text-xs">
          Claim value <span className="font-semibold text-slate-700">{value}</span>
        </span>
      </span>
    </button>
  );
}
