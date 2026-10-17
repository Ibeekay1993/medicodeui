import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

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
      <Loader2 className="h-5 w-5 animate-spin text-slate-500" aria-hidden="true" />
      <span className="text-sm font-medium text-slate-600">{label}</span>
    </div>
  );
}
