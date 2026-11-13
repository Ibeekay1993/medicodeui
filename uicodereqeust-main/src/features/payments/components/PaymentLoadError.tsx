import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PaymentLoadError({
  message = "Payment data could not be loaded. No totals or empty-state results are being shown.",
  onRetry,
  isRetrying = false,
}: {
  message?: string;
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5 text-sm text-rose-900">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{message}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={isRetrying} className="h-9 shrink-0 border-rose-300 bg-white text-rose-900 hover:bg-rose-100">
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
        {isRetrying ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}
