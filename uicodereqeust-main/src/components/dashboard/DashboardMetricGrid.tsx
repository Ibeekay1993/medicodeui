import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type DashboardMetric = {
  label: string;
  value: string | number;
  icon: import("lucide-react").LucideIcon;
  color?: string;
};

const MetricSkeleton = () => (
  <span className="inline-block h-5 w-14 animate-pulse rounded bg-slate-200" aria-label="Loading" />
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
    <div className={cn("grid gap-3", columns)}>
      {items.map((item) => (
        <Card key={item.label} className="flex min-h-[88px] min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:gap-4 sm:p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 sm:h-11 sm:w-11" aria-hidden="true">
            <item.icon className={cn("h-5 w-5", item.color || "text-slate-600")} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium leading-5 text-slate-500">{item.label}</p>
            <p className={cn("mt-0.5 whitespace-nowrap text-lg font-semibold leading-6 tabular-nums sm:text-xl", item.color || "text-slate-900")}>
              {loading ? <MetricSkeleton /> : typeof item.value === "number" ? item.value.toLocaleString() : item.value}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
