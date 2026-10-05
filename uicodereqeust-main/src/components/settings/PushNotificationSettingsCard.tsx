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
  getRegisteredPushSubscription,
  getPushServiceWorkerRegistration,
  sendPushTestNotification,
} from "@/lib/pushNotifications";

export default function PushNotificationSettingsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isLoading, setIsLoading] = useState(false);
  const [setupIncomplete, setSetupIncomplete] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const isSupported = isPushNotificationSupported();

  const checkStatus = useCallback(async () => {
    if (!isSupported) return;
    setPermission(getNotificationPermission());
    if (!user?.id) return;
    const status = await getRegisteredPushSubscription(user.id);
    setIsSubscribed(status.registered);
    setSetupIncomplete(!!status.subscription && !status.registered);
    setSetupError(status.error || null);
  }, [isSupported, user?.id]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleToggle = async (checked: boolean) => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const res = checked
        ? await subscribeToPushNotifications(user.id)
        : await unsubscribeFromPushNotifications(user.id);

      if (!res.success) {
        setSetupError(res.error || "Please check your browser notification settings and try again.");
        toast({
          title: checked ? "Failed to Enable Notifications" : "Failed to Disable Notifications",
          description: res.error || "Please check your browser notification settings and try again.",
          variant: "destructive",
        });
        setPermission(getNotificationPermission());
        return;
      }

      setIsSubscribed(checked);
      setSetupIncomplete(false);
      setSetupError(null);
      if (checked) setPermission("granted");
      toast({
        title: checked ? "Push Notifications Enabled" : "Push Notifications Disabled",
        description: checked
          ? "This device can now receive request alerts."
          : "Background alerts have been turned off for this device.",
      });
    } catch (error: unknown) {
      toast({
        title: checked ? "Failed to Enable Notifications" : "Failed to Disable Notifications",
        description: error instanceof Error ? error.message : "Something stopped notification setup. Try again.",
        variant: "destructive",
      });
      setPermission(getNotificationPermission());
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestNotification = async () => {
    if (!isSupported || !user?.id || testingPush) return;
    setTestingPush(true);
    try {
      const result = await sendPushTestNotification(user.id);
      if (!result.success) throw new Error(result.error || "The server push test failed.");
      toast({ title: "Test push sent", description: `The production push service accepted the test for ${result.sentCount} registered device${result.sentCount === 1 ? "" : "s"}. Check this device's notifications.` });
    } catch (error: unknown) {
      toast({
        title: "Test Failed",
        description: error instanceof Error ? error.message : "Please check that browser notifications are allowed.",
        variant: "destructive",
      });
    } finally {
      setTestingPush(false);
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
              <Badge variant="outline" className={`text-xs font-semibold ${setupIncomplete ? "text-amber-800 bg-amber-50 border-amber-300" : "text-slate-500 bg-slate-50 border-slate-200"}`}>
                {setupIncomplete ? "Setup incomplete" : "Disabled"}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {!isSupported ? (
          <div className="rounded-xl bg-amber-50/70 border border-amber-100 p-3.5 text-xs text-amber-800 leading-relaxed">
            Push notifications are not supported here. Try <strong>Google Chrome</strong>. On iPhone or iPad, add the portal to your Home Screen and open the installed app before enabling alerts.
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
                Receive request alerts while the browser is closed. Each device must allow notifications and register successfully.
              </p>
              {setupIncomplete && (
                <p role="status" className="pt-1 text-xs font-medium text-amber-800">
                  This browser has a notification subscription, but it is not registered to this account. Turn notifications on again to repair setup.
                </p>
              )}
              {setupError && !setupIncomplete && (
                <p role="status" className="pt-1 text-xs font-medium text-rose-700">{setupError}</p>
              )}
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
                  <RefreshCw className={`h-3 w-3 mr-1.5 ${testingPush ? "animate-spin" : ""}`} />
                  {testingPush ? "Sending test" : "Test push"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => handleToggle(false)} disabled={isLoading || testingPush} className="text-xs h-9 px-3 text-slate-600">
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
                  {isLoading ? "Enabling…" : setupIncomplete ? "Repair Notifications" : "Turn On Notifications"}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
