/**
 * pushNotifications.ts
 * Utility helpers for the Web Push Notification API.
 *
 * Handles:
 *  - Feature detection
 *  - Requesting permission
 *  - Subscribing the browser to push (VAPID)
 *  - Saving / removing subscriptions in Supabase
 */

import { supabase } from "@/integrations/supabase/client";

/** VAPID public key injected via Vite env */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
const VAPID_KEY_STORAGE = "ronsberger_push_vapid_public_key";
const PUSH_OPT_OUT_PREFIX = "ronsberger_push_opt_out:";

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeoutId));
}

export function hasOptedOutOfPush(userId: string): boolean {
  return localStorage.getItem(`${PUSH_OPT_OUT_PREFIX}${userId}`) === "true";
}

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getNotificationPermission(): NotificationPermission {
  if (!isPushNotificationSupported()) return "denied";
  return Notification.permission;
}

// ---------------------------------------------------------------------------
// VAPID key conversion (base64url → Uint8Array)
// ---------------------------------------------------------------------------

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ---------------------------------------------------------------------------
// Subscribe
// ---------------------------------------------------------------------------

export async function subscribeToPushNotifications(userId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!isPushNotificationSupported()) {
    return { success: false, error: "Push notifications not supported in this browser." };
  }

  if (!VAPID_PUBLIC_KEY) {
    return { success: false, error: "VAPID public key not configured." };
  }

  // 1. Request browser permission
  let permission: NotificationPermission;
  try {
    permission = await withTimeout(
      Notification.requestPermission(),
      60_000,
      "The browser permission prompt did not finish. Please allow notifications and try again.",
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Could not request notification permission";
    return { success: false, error: msg };
  }
  if (permission !== "granted") {
    return { success: false, error: "Notification permission denied by user." };
  }

  // 2. Get the active service worker registration
  let registration: ServiceWorkerRegistration;
  try {
    registration = await withTimeout(
      navigator.serviceWorker.ready,
      15_000,
      "The portal notification service is still starting. Reload the page and try again.",
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Service worker is not ready";
    return { success: false, error: msg };
  }

  // 3. Reuse a compatible subscription, or rotate an older one to the
  // currently configured VAPID key after a key change.
  let subscription: PushSubscription;
  try {
    const existing = await withTimeout(
      registration.pushManager.getSubscription(),
      15_000,
      "The browser took too long to check this device's notification setup.",
    );
    const configuredKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const existingKey = existing?.options.applicationServerKey;
    const existingKeyMatches = existingKey
      ? new Uint8Array(existingKey).length === configuredKey.length &&
        new Uint8Array(existingKey).every((byte, index) => byte === configuredKey[index])
      : localStorage.getItem(VAPID_KEY_STORAGE) === VAPID_PUBLIC_KEY;

    if (existing && !existingKeyMatches) {
      const removed = await withTimeout(existing.unsubscribe(), 15_000, "The old notification subscription could not be replaced.");
      if (!removed) throw new Error("The old notification subscription could not be replaced. Turn notifications off in browser settings, then try again.");
    }
    subscription = (existing && existingKeyMatches ? existing : null) ??
      await withTimeout(registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: configuredKey,
      }), 20_000, "The browser did not finish creating a notification subscription. Check browser notification permissions and try again.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown push subscribe error";
    return { success: false, error: msg };
  }

  // 4. Extract keys
  const subJson = subscription.toJSON();
  const p256dh = subJson.keys?.p256dh ?? "";
  const auth = subJson.keys?.auth ?? "";

  // 5. Store in Supabase push_subscriptions table
  let dbErr: { message: string } | null = null;
  try {
    const { error } = await withTimeout(
      (supabase as any)
        .from("push_subscriptions")
        .upsert(
          {
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent.slice(0, 255),
            last_used_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" },
        ),
      15_000,
      "Could not save this device's notification subscription. Check your connection and try again.",
    );
    dbErr = error;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Could not save this device's notification subscription." };
  }

  if (dbErr) {
    return { success: false, error: dbErr.message };
  }

  localStorage.setItem(VAPID_KEY_STORAGE, VAPID_PUBLIC_KEY);
  localStorage.removeItem(`${PUSH_OPT_OUT_PREFIX}${userId}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Unsubscribe
// ---------------------------------------------------------------------------

export async function unsubscribeFromPushNotifications(userId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  localStorage.setItem(`${PUSH_OPT_OUT_PREFIX}${userId}`, "true");
  if (!isPushNotificationSupported()) return { success: true };

  try {
    const registration = await withTimeout(navigator.serviceWorker.ready, 15_000, "The notification service is still starting. Reload the page and try again.");
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await (supabase as any)
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", sub.endpoint)
        .eq("user_id", userId);
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unsubscribe error";
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Check if the current browser is already subscribed
// ---------------------------------------------------------------------------

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushNotificationSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Best-effort approver alert for a newly created pending authorization. */
export async function notifyPendingAuthorizationRequest(input: {
  requestId: string;
  hospitalName?: string | null;
  source?: string | null;
}): Promise<void> {
  try {
    const sourceLabel = input.source === "whatsapp" || input.source === "whatsapp_parser"
      ? "WhatsApp"
      : "hospital portal";
    const { error } = await supabase.functions.invoke("send-push-notification", {
      body: {
        target_roles: ["admin", "utilization_manager", "utilization_manager_lead", "claims", "finance"],
        title: "New Pending Authorization Request",
        body: `A new request from ${input.hospitalName || "a hospital"} via ${sourceLabel} is ready for review.`,
        url_by_role: {
          admin: "/backoffice/admin/requests",
          utilization_manager: "/backoffice/utilization-manager/requests",
          utilization_manager_lead: "/backoffice/utilization-manager/requests",
          claims: "/backoffice/claims",
          finance: "/backoffice/finance",
        },
        tag: `auth-request-${input.requestId}`,
      },
    });
    if (error) console.error("Failed to dispatch pending-request push notification", error);
  } catch (error) {
    console.error("Failed to dispatch pending-request push notification", error);
  }
}
