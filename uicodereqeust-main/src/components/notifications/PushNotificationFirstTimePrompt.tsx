/**
 * PushNotificationFirstTimePrompt.tsx
 *
 * Compact bottom-anchored toast that prompts users to enable push notifications.
 * Requests notification permission after the first authenticated staff gesture,
 * because browsers prohibit silent permission grants. Users can opt out here
 * or later from Settings.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { Bell, X, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  isPushNotificationSupported,
  getNotificationPermission,
  subscribeToPushNotifications,
  hasOptedOutOfPush,
} from "@/lib/pushNotifications";

const STAFF_ROLES = new Set(["admin", "utilization_manager", "utilization_manager_lead", "claims", "finance"]);
type SetupResult = Awaited<ReturnType<typeof subscribeToPushNotifications>>;

export function PushNotificationFirstTimePrompt() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const setupRequestRef = useRef<{ userId: string; promise: Promise<SetupResult> } | null>(null);

  const registerThisDevice = useCallback((userId: string) => {
    const pending = setupRequestRef.current;
    if (pending?.userId === userId) return pending.promise;

    let request: Promise<SetupResult>;
    request = subscribeToPushNotifications(userId).finally(() => {
      if (setupRequestRef.current?.promise === request) setupRequestRef.current = null;
    });
    setupRequestRef.current = { userId, promise: request };
    return request;
  }, []);

  useEffect(() => {
    if (!user?.id || !role || !STAFF_ROLES.has(role)) return;
    if (!isPushNotificationSupported()) return;

    const perm = getNotificationPermission();

    if (hasOptedOutOfPush(user.id)) return;

    // Permission already granted — keep this account subscribed on this device.
    if (perm === "granted") {
      registerThisDevice(user.id).then((result) => {
        if (result.success) setVisible(false);
        else {
          setSetupError("Notifications are allowed by your browser, but this device could not be registered with the portal. Retry or ask your administrator for help.");
          setVisible(true);
        }
      }).catch(() => {});
      return;
    }

    // Browser blocked notifications
    if (perm === "denied") return;

    const t = setTimeout(() => setVisible(true), 600);
    return () => {
      clearTimeout(t);
    };
  }, [user?.id, role, registerThisDevice]);

  const handleEnable = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setSetupError(null);
    try {
      const result = await registerThisDevice(user.id);
      if (result.success) {
        setVisible(false);
        toast({
          title: "Notifications enabled",
          description: "This device can now receive request alerts.",
        });
      } else {
        const message = result.error || "Allow notifications in your browser settings, then try again.";
        setSetupError(message);
        toast({
          title: "Could not enable notifications",
          description: message,
          variant: "destructive",
        });
        if (getNotificationPermission() === "denied") setVisible(false);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Notification setup stopped unexpectedly. Try again.";
      setSetupError(message);
      toast({
        title: "Could not enable notifications",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, toast, registerThisDevice]);

  const handleDismiss = useCallback(() => {
    if (user?.id) localStorage.setItem(`ronsberger_push_opt_out:${user.id}`, "true");
    setVisible(false);
  }, [user?.id]);

  if (!visible) return null;

  return (
    /* Fixed bottom toast — sits above the mobile nav bar */
    <div
      data-push-prompt
      className="fixed bottom-20 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:w-[360px] z-[200]
                 animate-in slide-in-from-bottom-4 fade-in duration-300"
      role="dialog"
      aria-label="Enable Push Notifications"
    >
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">

        <div className="p-4 pt-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-700">
                <Bell className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 leading-tight">
                  Notifications
                </p>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                  Enable alerts for incoming authorization requests.
                </p>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {setupError && <p role="status" className="mt-3 text-xs leading-relaxed text-rose-700">{setupError}</p>}

          {/* Info line */}
          <div className="flex items-start gap-2 mt-3 px-1">
            <Settings2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            <p className="text-xs text-slate-500 leading-relaxed">
              Enable alerts here, or turn them off in{" "}
              <strong className="text-slate-700 font-semibold">
                Settings → Alerts
              </strong>
              .
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={handleDismiss}
              className="min-h-11 flex-1 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Turn Off
            </Button>
            <Button
              type="button"
              onClick={handleEnable}
              disabled={isLoading}
              aria-busy={isLoading}
              className="min-h-11 flex-1 bg-slate-900 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              {isLoading ? "Setting up…" : setupError ? "Retry setup" : "Enable alerts"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
