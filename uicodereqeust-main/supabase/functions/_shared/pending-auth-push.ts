type PushClient = {
  functions: {
    invoke: (
      functionName: string,
      options: {
        body: Record<string, unknown>;
        headers?: Record<string, string>;
      },
    ) => Promise<{ data: any; error: any }>;
  };
};

/** Dispatch a best-effort approver alert without delaying request creation. */
export function schedulePendingAuthorizationPush(
  supabase: PushClient,
  requestId: string,
  hospitalName: string | null | undefined,
) {
  const sharedSecret = Deno.env.get("WHATSAPP_WORKER_SECRET") ||
    Deno.env.get("MEDAUTH_INTERNAL_API_KEY") || "";

  if (!sharedSecret) {
    console.warn("Pending-request push skipped: internal shared secret is not configured.");
    return;
  }

  const delivery = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "send-push-notification",
        {
          headers: { "x-worker-secret": sharedSecret },
          body: {
            target_roles: [
              "admin",
              "utilization_manager",
              "utilization_manager_lead",
              "claims",
              "finance",
            ],
            title: "New Pending Authorization Request",
            body: `A new request from ${hospitalName || "a hospital"} via WhatsApp is ready for review.`,
            url_by_role: {
              admin: "/backoffice/admin/requests",
              utilization_manager: "/backoffice/utilization-manager/requests",
              utilization_manager_lead: "/backoffice/utilization-manager/requests",
              claims: "/backoffice/claims",
              finance: "/backoffice/finance",
            },
            tag: `auth-request-${requestId}`,
          },
        },
      );

      if (error) {
        console.error("Failed to dispatch WhatsApp authorization push", error);
      } else if (!data?.success || data.sent_count === 0 || data.failed_count > 0) {
        console.warn("WhatsApp authorization push delivery needs attention", {
          success: data?.success,
          sentCount: data?.sent_count ?? 0,
          failedCount: data?.failed_count ?? 0,
          reason: data?.message || data?.error || "No active approver device subscription.",
        });
      }
    } catch (error) {
      console.error("Failed to dispatch WhatsApp authorization push", error);
    }
  })();

  const runtime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;

  if (runtime?.waitUntil) runtime.waitUntil(delivery);
  else void delivery;
}
