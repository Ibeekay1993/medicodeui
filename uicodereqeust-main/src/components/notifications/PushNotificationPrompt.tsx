/**
 * PushNotificationPrompt.tsx
 *
 * A compact notification bell icon button for the Dashboard header that:
 *  - Shows as a small pulsing ring when push is NOT yet enabled (for eligible staff)
 *  - Shows as solid when push IS enabled
 *  - On click, opens a small popover to enable / disable push notifications
 *  - Only renders for admin / utilization_manager roles (approvers need alerts)
 */

import { useEffect, useState, useCallback } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  isPushNotificationSupported,
  getNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  getExistingSubscription,
} from "@/lib/pushNotifications";

const PUSH_ELIGIBLE_ROLES = ["admin", "utilization_manager"];

export function PushNotificationPrompt() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [open, setOpen] = useState(false);

  const isSupported = isPushNotificationSupported();
  const isEligible = role && PUSH_ELIGIBLE_ROLES.includes(role as string);

  // Check current subscription state on mount
  useEffect(() => {
    if (!isSupported || !isEligible) return;
    setPermission(getNotificationPermission());
    getExistingSubscription().then((sub) => setIsSubscribed(!!sub));
  }, [isSupported, isEligible]);

  const handleEnable = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    const result = await subscribeToPushNotifications(user.id);
    setIsLoading(false);
    if (result.success) {
      setIsSubscribed(true);
      setPermission("granted");
      setOpen(false);
      toast({
        title: "Push Notifications Enabled",
        description: "You will now receive alerts even when the app is closed.",
      });
    } else {
      toast({
        title: "Could not enable notifications",
        description: result.error || "Please check your browser settings.",
        variant: "destructive",
      });
    }
  }, [user?.id, toast]);

  const handleDisable = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    const result = await unsubscribeFromPushNotifications(user.id);
    setIsLoading(false);
    if (result.success) {
      setIsSubscribed(false);
      setOpen(false);
      toast({
        title: "Push Notifications Disabled",
        description: "You will no longer receive background alerts.",
      });
    } else {
      toast({
        title: "Could not disable notifications",
        description: result.error,
        variant: "destructive",
      });
    }
  }, [user?.id, toast]);

  // Don't render for non-eligible roles or unsupported browsers
  if (!isSupported || !isEligible) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 rounded-lg"
          aria-label={isSubscribed ? "Push notifications enabled" : "Enable push notifications"}
        >
          {isSubscribed ? (
            <Bell className="h-4 w-4 text-brand-700" />
          ) : (
            <>
              <Bell className="h-4 w-4 text-slate-400" />
              {/* Pulsing ring to draw attention when not yet enabled */}
              <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="end">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {isSubscribed ? (
              <Bell className="h-5 w-5 text-brand-700 shrink-0" />
            ) : (
              <BellOff className="h-5 w-5 text-slate-400 shrink-0" />
            )}
            <h4 className="text-sm font-semibold text-slate-900">
              {isSubscribed ? "Push Notifications Active" : "Enable Push Notifications"}
            </h4>
          </div>

          {permission === "denied" ? (
            <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              Notifications are <strong>blocked</strong> in your browser settings. Open Chrome Settings → Site Settings → Notifications and allow this site, then reload.
            </div>
          ) : isSubscribed ? (
            <p className="text-xs text-slate-500 leading-relaxed">
              You will receive a native phone/desktop notification whenever a new authorization request is submitted — even when this app is closed.
            </p>
          ) : (
            <p className="text-xs text-slate-500 leading-relaxed">
              Get instant alerts on your phone or desktop when new authorization requests arrive for approval — even when Chrome is closed.
            </p>
          )}

          {permission !== "denied" && (
            <div className="flex gap-2">
              {isSubscribed ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  disabled={isLoading}
                  onClick={handleDisable}
                >
                  {isLoading ? "Disabling…" : "Turn Off"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="flex-1 text-xs bg-brand-700 hover:bg-brand-800 text-white"
                  disabled={isLoading}
                  onClick={handleEnable}
                >
                  {isLoading ? "Enabling…" : "Enable Notifications"}
                </Button>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
