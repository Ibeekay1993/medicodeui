import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type DashboardMetric = {
  label: string;
  value: string | number;
  icon: import("lucide-react").LucideIcon;
  color?: string;
};

const MetricSkeleton = () => (
  <span className="inline-block h-4 w-16 animate-pulse rounded bg-slate-200" aria-label="Loading" />
);

export function DashboardMetricGrid({
  items,
  loading,
  columns = "grid-cols-2 xl:grid-cols-4",
}: {
  items: DashboardMetric[];
  loading: boolean;
  columns?: string;
}) {
  return (
    <div className={cn("grid gap-2 sm:gap-2.5", columns)}>
      {items.map((item) => (
        <Card
          key={item.label}
          className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-2.5 sm:p-3 shadow-xs hover:border-slate-300 transition-colors min-h-[66px] sm:min-h-[74px]"
        >
          {/* Top Row: Metric Label + Compact Icon */}
          <div className="flex items-center justify-between gap-1 mb-1">
            <span
              className="text-[10.5px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 truncate"
              title={item.label}
            >
              {item.label}
            </span>
            <span
              className="flex h-5 w-5 sm:h-5.5 sm:w-5.5 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-500 border border-slate-100"
              aria-hidden="true"
            >
              <item.icon className={cn("h-3 w-3 sm:h-3.5 sm:w-3.5", item.color || "text-slate-600")} strokeWidth={1.8} />
            </span>
          </div>

          {/* Bottom Row: Well-situated Numeric/Currency Value with proper typography & full width */}
          <div className="min-w-0">
            <p
              className={cn(
                "font-mono text-sm sm:text-base md:text-lg font-bold tracking-tight tabular-nums leading-tight truncate",
                item.color || "text-slate-900"
              )}
              title={typeof item.value === "string" ? item.value : String(item.value)}
            >
              {loading ? (
                <MetricSkeleton />
              ) : typeof item.value === "number" ? (
                item.value.toLocaleString()
              ) : (
                item.value
              )}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
