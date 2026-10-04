import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "https://esm.sh/web-push@3.6.7";
import { corsHeaders, getServiceClient, validateUser } from "../_shared/auth.ts";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:support@ronsbergerhmo.com";
const INTERNAL_SHARED_SECRET = Deno.env.get("WHATSAPP_WORKER_SECRET") || Deno.env.get("MEDAUTH_INTERNAL_API_KEY") || "";

const ALLOWED_ROLES = ["admin", "utilization_manager", "utilization_manager_lead", "hospital", "claims", "finance"];

function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const min = Math.min(a.length, b.length);
  for (let i = 0; i < min; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const apiKey = req.headers.get("x-api-key") || "";
    const workerSecret = req.headers.get("x-worker-secret") || "";
    const internalCall = !!INTERNAL_SHARED_SECRET &&
      (constantTimeEqual(apiKey, INTERNAL_SHARED_SECRET) || constantTimeEqual(workerSecret, INTERNAL_SHARED_SECRET));

    // Browser callers must be signed-in staff. The trusted server-to-server
    // path is used for requests created by Evolution's WhatsApp worker.
    if (!internalCall) await validateUser(req, ALLOWED_ROLES);

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error("Push notifications are not configured on the server");
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const { target_roles, target_user_ids, title, body, url, tag, url_by_role } = await req.json();

    const service = getServiceClient();
    let targetUserIds: string[] = [];

    if (Array.isArray(target_user_ids) && target_user_ids.length > 0) {
      targetUserIds = target_user_ids;
    } else if (Array.isArray(target_roles) && target_roles.length > 0) {
      const { data: roleUsers, error: roleError } = await service
        .from("user_roles")
        .select("user_id, role")
        .in("role", target_roles)
        .eq("access_status", "active");

      if (roleError) {
        throw new Error(`Failed to query user roles: ${roleError.message}`);
      }

      targetUserIds = (roleUsers || []).map((r: { user_id: string }) => r.user_id);
    }

    if (targetUserIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No target users found", sent_count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query subscriptions for target users
    const { data: subscriptions, error: subError } = await service
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id")
      .in("user_id", targetUserIds);

    if (subError) {
      throw new Error(`Failed to query push subscriptions: ${subError.message}`);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active push subscriptions for target users", sent_count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const roleByUser = new Map<string, string>();
    if (Array.isArray(target_roles) && target_roles.length > 0) {
      const { data: roleRows } = await service.from("user_roles").select("user_id, role").in("user_id", targetUserIds);
      for (const row of roleRows || []) roleByUser.set(row.user_id, row.role);
    }

    const deadSubscriptionEndpoints: string[] = [];
    let sentCount = 0;
    let failedCount = 0;

    const pushPromises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        const role = roleByUser.get(sub.user_id);
        const payload = JSON.stringify({
          title: title || "Ronsberger HMO Portal",
          body: body || "You have a new update pending approval.",
          url: (role && url_by_role?.[role]) || url || "/",
          tag: tag || "ronsberger-auth-request",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
        });
        await webpush.sendNotification(pushSubscription, payload, {
          TTL: 86400, // 24 hours
          urgency: "high",
        });
        sentCount++;
      } catch (err: any) {
        failedCount++;
        // If the subscription is expired or unregistered, mark for deletion
        if (err.statusCode === 404 || err.statusCode === 410) {
          deadSubscriptionEndpoints.push(sub.endpoint);
        } else {
          console.warn(`Push delivery failed for endpoint ${sub.endpoint}:`, err.message || err);
        }
      }
    });

    await Promise.all(pushPromises);

    // Clean up dead subscriptions
    if (deadSubscriptionEndpoints.length > 0) {
      await service
        .from("push_subscriptions")
        .delete()
        .in("endpoint", deadSubscriptionEndpoints);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_count: sentCount,
        failed_count: failedCount,
        cleaned_stale_subscriptions: deadSubscriptionEndpoints.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("send-push-notification error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
      { status: /Unauthorized|Role not permitted|deactivated/i.test(error.message || "") ? 401 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
