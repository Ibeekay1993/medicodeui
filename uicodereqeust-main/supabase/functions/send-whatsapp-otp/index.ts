import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { buildArrivalOtpPayload } from "../_shared/arrival-otp-message.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SEND_TIMEOUT_MS = 12_000;

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // This function is called by send-approval-email with its service-role
  // client. Do not allow a signed-in user to choose arbitrary recipients or PINs.
  const expectedKey = SUPABASE_SERVICE_ROLE_KEY;
  const bearerToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expectedKey || !constantTimeEqual(bearerToken, expectedKey)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (!SUPABASE_URL) return jsonResponse({ error: "WhatsApp sender is not configured" }, 503);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const payload = buildArrivalOtpPayload(body);
  if (!payload) return jsonResponse({ error: "Invalid phone number, PIN, or message size" }, 400);

  const senderUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/send-whatsapp`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(senderUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${expectedKey}`,
        apikey: expectedKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let senderResult: Record<string, unknown> = {};
    try {
      const result: unknown = await response.json();
      if (result && typeof result === "object" && !Array.isArray(result)) {
        senderResult = result as Record<string, unknown>;
      }
    } catch {
      // The sender's status code remains authoritative if its response is not JSON.
    }

    if (!response.ok || senderResult.success !== true) {
      console.error("Arrival PIN WhatsApp send failed", { status: response.status });
      return jsonResponse({ error: "WhatsApp send failed" }, 502);
    }

    return jsonResponse({
      success: true,
      method: "whatsapp",
      message_id: typeof senderResult.message_id === "string" ? senderResult.message_id : null,
    }, 200);
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    console.error("Arrival PIN WhatsApp sender unavailable", { timed_out: timedOut });
    return jsonResponse({ error: timedOut ? "WhatsApp send timed out" : "WhatsApp sender unavailable" }, 502);
  } finally {
    clearTimeout(timeout);
  }
});
