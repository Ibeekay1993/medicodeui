import { useEffect, useState } from "react";
import { BellOff, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { getExistingSubscription, unsubscribeFromPushNotifications } from "@/lib/pushNotifications";

export default function PushNotificationSettingsCard() {
  const { user } = useAuth();
  const [hasSubscription, setHasSubscription] = useState(false);
  const [checking, setChecking] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getExistingSubscription()
      .then((subscription) => {
        if (active) setHasSubscription(Boolean(subscription));
      })
      .catch(() => {
        if (active) setError("Could not check this device's saved notification subscription.");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const removeSubscription = async () => {
    if (!user?.id || removing) return;
    setRemoving(true);
    setError(null);
    try {
      const result = await unsubscribeFromPushNotifications(user.id);
      if (!result.success) throw new Error(result.error || "This device's subscription could not be removed.");
      setHasSubscription(false);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "This device's subscription could not be removed.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <BellOff className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-bold text-slate-900 sm:text-base">Push notifications</CardTitle>
              <CardDescription className="mt-1 text-xs text-slate-600">
                Background push alerts are paused while the request queue is stabilized.
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0 border-slate-300 bg-white text-slate-600">Paused</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <p className="text-xs leading-relaxed text-slate-600">
          WhatsApp intake, acknowledgements, approvals, and their existing WhatsApp messages continue to work. This setting will not start background push delivery.
        </p>
        {error && <p role="alert" className="break-words text-xs font-medium text-rose-700 [overflow-wrap:anywhere]">{error}</p>}
        {hasSubscription && (
          <Button
            type="button"
            variant="outline"
            onClick={removeSubscription}
            disabled={checking || removing || !user?.id}
            className="min-h-11 w-full justify-center gap-2 sm:w-auto"
          >
            {removing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            {removing ? "Removing device subscription…" : "Remove this device’s subscription"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
