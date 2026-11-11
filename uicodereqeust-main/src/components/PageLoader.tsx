import { cn } from "@/lib/utils";
import { BrandSpinner } from "@/components/BrandSpinner";

export function PageLoader({
  className,
  label = "Loading workspace...",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[80vh] w-full items-center justify-center gap-2 md:min-h-[60vh]",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <BrandSpinner className="h-7 w-7" />
      <span className="text-sm font-medium text-slate-600">{label}</span>
    </div>
  );
}
