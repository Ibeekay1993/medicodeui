import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const isErrorToast = props.variant === "destructive";
        const visibleTitle = isErrorToast && description ? description : title;
        const visibleDescription = isErrorToast ? null : description;

        return (
          <Toast key={id} {...props}>
            <div className="flex gap-3 items-start">
              {isErrorToast ? (
                <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              )}
              <div className="grid gap-1">
                {visibleTitle && <ToastTitle>{visibleTitle}</ToastTitle>}
                {visibleDescription && <ToastDescription>{visibleDescription}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
