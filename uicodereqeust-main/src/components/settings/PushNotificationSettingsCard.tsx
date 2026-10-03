/**
 * PushNotificationSettingsCard.tsx
 *
 * Mobile-first Settings card for managing Web Push Notifications.
 * Responsive settings card with clear enable/disable actions and a test alert.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, AlertTriangle, CheckCircle2, RefreshCw, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  isPushNotificationSupported,
  getNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  getExistingSubscription,
} from "@/lib/pushNotifications";

export default function PushNotificationSettingsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isLoading, setIsLoading] = useState(false);
  const isSupported = isPushNotificationSupported();

  const checkStatus = useCallback(async () => {
    if (!isSupported) return;
    setPermission(getNotificationPermission());
    const sub = await getExistingSubscription();
    setIsSubscribed(!!sub);
  }, [isSupported]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleToggle = async (checked: boolean) => {
    if (!user?.id) return;
    setIsLoading(true);

    if (checked) {
      const res = await subscribeToPushNotifications(user.id);
      setIsLoading(false);
      if (res.success) {
        setIsSubscribed(true);
        setPermission("granted");
        toast({
          title: "Push Notifications Enabled ✨",
          description: "You will receive instant alerts on your phone even when Chrome is closed.",
        });
      } else {
        toast({
          title: "Failed to Enable Notifications",
          description: res.error || "Please allow notifications in your browser settings.",
          variant: "destructive",
        });
        setPermission(getNotificationPermission());
      }
    } else {
      const res = await unsubscribeFromPushNotifications(user.id);
      setIsLoading(false);
      if (res.success) {
        setIsSubscribed(false);
        toast({
          title: "Push Notifications Disabled",
          description: "Background alerts have been turned off. You can reactivate anytime.",
        });
      } else {
        toast({
          title: "Failed to Disable Notifications",
          description: res.error,
          variant: "destructive",
        });
      }
    }
  };

  const handleTestNotification = async () => {
    if (!isSupported || !("serviceWorker" in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification("Ronsberger HMO Alert 🔔", {
        body: "Push notifications are working properly on your device!",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "test-alert",
      });
      toast({
        title: "Test Alert Dispatched",
        description: "A test notification was triggered on this device.",
      });
    } catch {
      toast({
        title: "Test Failed",
        description: "Please check that browser notifications are allowed.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden transition-all">
      <CardHeader className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 shrink-0">
              {isSubscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5 text-slate-400" />}
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                Push Notifications
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Instant background alerts on your mobile device or desktop
              </CardDescription>
            </div>
          </div>
          <div className="self-start sm:self-auto">
            {!isSupported ? (
              <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-700">
                Not Supported
              </Badge>
            ) : permission === "denied" ? (
              <Badge variant="outline" className="text-xs border-rose-300 bg-rose-50 text-rose-700 font-semibold">
                Blocked
              </Badge>
            ) : isSubscribed ? (
              <Badge className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 font-semibold">
                <CheckCircle2 className="h-3 w-3" /> Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-slate-500 bg-slate-50 border-slate-200 font-semibold">
                Disabled
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {!isSupported ? (
          <div className="rounded-xl bg-amber-50/70 border border-amber-100 p-3.5 text-xs text-amber-800 leading-relaxed">
            Push notifications are not supported by this browser. Try opening the portal in <strong>Google Chrome</strong> or installing the app to your Home Screen.
          </div>
        ) : permission === "denied" ? (
          <div className="rounded-xl bg-rose-50 border border-rose-100 p-3.5 text-xs text-rose-800 space-y-1.5 leading-relaxed">
            <div className="flex items-center gap-1.5 font-bold text-rose-900">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              Notifications are currently blocked
            </div>
            <p className="text-rose-700">
              To allow notifications, tap the lock or site settings icon next to the URL in your browser address bar, set <strong>Notifications</strong> to <strong>Allow</strong>, and reload the page.
            </p>
          </div>
        ) : (
          <div
            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border transition-opacity ${
              isLoading ? "opacity-60 pointer-events-none" : ""
            } ${
              isSubscribed
                ? "bg-emerald-50/60 border-emerald-100"
                : "bg-slate-50/90 border-slate-200"
            }`}
          >
            <div className="space-y-1 flex-1 pr-2">
              <div className="flex items-center gap-1.5 font-semibold text-slate-900 text-xs sm:text-sm">
                <Smartphone className="h-4 w-4 text-brand-700 shrink-0" />
                <span>Background Pre-Auth &amp; Approval Alerts</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Receive instant notifications when new requests arrive for review — even when Chrome or your browser is closed.
              </p>
            </div>

            {isSubscribed ? (
              /* Enabled state — optional test alert and a clear disable action */
              <div className="flex items-center w-full sm:w-auto gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-emerald-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestNotification}
                  className="text-xs h-9 px-3 text-slate-700 hover:text-slate-900 bg-white border-slate-200 flex-1 sm:flex-none"
                >
                  <RefreshCw className="h-3 w-3 mr-1.5" /> Test Alert
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => handleToggle(false)} disabled={isLoading} className="text-xs h-9 px-3 text-slate-600">
                  Turn Off
                </Button>
              </div>
            ) : (
              /* One clear action avoids presenting a second, redundant control. */
              <div className="flex items-center w-full sm:w-auto gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleToggle(true)}
                  disabled={isLoading}
                  className="text-xs h-9 px-4 bg-brand-700 hover:bg-brand-800 text-white font-semibold shadow-sm flex-1 sm:flex-none"
                >
                  <Bell className="h-3.5 w-3.5 mr-1.5" />
                  {isLoading ? "Enabling…" : "Turn On Notifications"}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
