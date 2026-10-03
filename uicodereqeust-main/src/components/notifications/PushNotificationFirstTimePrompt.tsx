/**
 * PushNotificationFirstTimePrompt.tsx
 *
 * Compact bottom-anchored toast that prompts users to enable push notifications.
 * - Does NOT auto-dismiss — stays visible until the user explicitly acts.
 * - Tells users they can enable/disable later in Settings.
 * - Snoozed for 2 days via localStorage after dismiss; cleared on enable.
 * - Session-level guard via sessionStorage prevents re-showing on same session.
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
} from "@/lib/pushNotifications";

const SESSION_KEY = "ronsberger_push_session_dismissed";
const SNOOZE_KEY = "ronsberger_push_prompt_v3";
const SNOOZE_DAYS = 2;

export function PushNotificationFirstTimePrompt() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Ref prevents the useEffect from double-showing in React StrictMode
  const didCheck = useRef(false);

  useEffect(() => {
    if (didCheck.current) return;
    if (!user?.id) return;
    // Auth is loaded asynchronously. Do not consume the one-time check while
    // the user is still null, or the prompt will never appear after sign-in.
    didCheck.current = true;
    if (!isPushNotificationSupported()) return;

    const perm = getNotificationPermission();

    // Permission already granted — silently re-subscribe if needed
    if (perm === "granted") {
      // Reconcile the device subscription and persist it for this account.
      subscribeToPushNotifications(user.id).catch(() => {});
      return;
    }

    // Browser blocked notifications
    if (perm === "denied") return;

    // Already dismissed this session
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Snoozed recently
    const snoozedAt = localStorage.getItem(SNOOZE_KEY);
    if (snoozedAt) {
      const daysSince = (Date.now() - parseInt(snoozedAt, 10)) / 86_400_000;
      if (daysSince < SNOOZE_DAYS) return;
    }

    // Show with a short delay so the page settles first
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, [user?.id]);

  const handleEnable = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    const result = await subscribeToPushNotifications(user.id);
    setIsLoading(false);

    if (result.success) {
      localStorage.removeItem(SNOOZE_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      setVisible(false);
      toast({
        title: "Push Notifications Active 🔔",
        description:
          "You will now receive instant alerts on your phone even when Chrome is closed.",
      });
    } else {
      toast({
        title: "Could Not Enable Notifications",
        description:
          result.error || "Please allow notifications in your browser prompt.",
        variant: "destructive",
      });
      // If user permanently blocked in the OS prompt, close the card
      if (getNotificationPermission() === "denied") setVisible(false);
    }
  }, [user?.id, toast]);

  const handleDismiss = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, "true");
    localStorage.setItem(SNOOZE_KEY, Date.now().toString());
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    /* Fixed bottom toast — sits above the mobile nav bar */
    <div
      className="fixed bottom-20 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:w-[360px] z-[200]
                 animate-in slide-in-from-bottom-4 fade-in duration-300"
      role="dialog"
      aria-label="Enable Push Notifications"
    >
      <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        {/* Accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-600 to-brand-400 rounded-t-2xl" />

        <div className="p-4 pt-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700 shrink-0">
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-600" />
                </span>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 leading-tight">
                  Turn On Push Notifications
                </p>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                  Get alerts even when your browser is closed
                </p>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Info line */}
          <div className="flex items-start gap-2 mt-3 px-1">
            <Settings2 className="h-3.5 w-3.5 text-brand-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500 leading-relaxed">
              You can enable or disable push alerts anytime in{" "}
              <strong className="text-slate-700 font-semibold">
                Settings → Push Notifications
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
              className="flex-1 text-xs h-9 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            >
              Maybe Later
            </Button>
            <Button
              type="button"
              onClick={handleEnable}
              disabled={isLoading}
              className="flex-1 text-xs h-9 bg-brand-700 hover:bg-brand-800 text-white font-semibold shadow-sm"
            >
              {isLoading ? "Enabling…" : "Enable Alerts"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
