// supabase/functions/send-whatsapp/index.ts
//
// Server-to-server Evolution outbound transport.
//
// All Evolution-bound sends from inside Supabase must go through this function
// so that:
//   1. The Evolution `apikey` is never exposed to the browser.
//   2. We have a single place to enforce authentication on outbound WhatsApp.
//   3. We can swap the Evolution instance or rotate keys without touching the
//      internal call sites (send-referral-notification, send-submission-notification,
//      any future internal automation).
//
// Authentication: this function is intentionally NOT JWT-gated for browser use
// today. It is server-side only. Callers authenticate with either:
//   - `X-Api-Key: $INTERNAL_API_KEY`     (recommended for service-to-service)
//   - `X-Worker-Secret: $WHATSAPP_WORKER_SECRET`  (legacy)
//
// Body:
//   {
//     "phone_number": "2348012345678",   // required, normalised internally
//     "message":      "..."               // required
//   }
//
// Response:
//   { "success": true, "message_id": "<evolution key id>" } on 200
//   { "error":   true, "message": "..."  } on 4xx/5xx
//
// The function does NOT log message bodies or phone numbers beyond the last
// 4 digits in error paths.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-worker-secret",
};

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME") || "medicode-test";
const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || "";
const WHATSAPP_WORKER_SECRET = Deno.env.get("WHATSAPP_WORKER_SECRET") || "";
// Hard cap on outbound text size. WhatsApp itself truncates around 65k chars.
const MAX_MESSAGE_CHARS = 4000;

function bad(status: number, message: string) {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhoneNumber(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.length === 10) return "234" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "234" + digits.slice(1);
  return digits;
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const min = Math.min(a.length, b.length);
  for (let i = 0; i < min; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "method_not_allowed");

  // ── 1) Authenticate ────────────────────────────────────────────────────
  // Authenticate by:
  // A) Server-to-server credentials (X-Api-Key / X-Worker-Secret)
  // B) Authenticated HMO staff JWT (utilization_manager, admin, doctor, claims)
  const apiKey = req.headers.get("x-api-key") || "";
  const workerSecret = req.headers.get("x-worker-secret") || "";

  const authedByApiKey = !!INTERNAL_API_KEY && constantTimeEqual(apiKey, INTERNAL_API_KEY);
  const authedByWorkerSecret = !!WHATSAPP_WORKER_SECRET && constantTimeEqual(workerSecret, WHATSAPP_WORKER_SECRET);

  let isAuthorized = authedByApiKey || authedByWorkerSecret;
  if (!isAuthorized && req.headers.get("Authorization")) {
    try {
      await validateUser(req, ["utilization_manager", "admin", "claims", "doctor", "nurse", "medical_officer"]);
      isAuthorized = true;
    } catch {
      isAuthorized = false;
    }
  }

  if (!isAuthorized) {
    return bad(401, "unauthorized");
  }

  // ── 2) Validate body ───────────────────────────────────────────────────
  let body: any;
  try { body = await req.json(); } catch { return bad(400, "invalid_json"); }
  const phoneRaw = String(body.phone_number || "").trim();
  const message = String(body.message || "").trim();
  if (!phoneRaw) return bad(400, "phone_number_required");
  if (!message) return bad(400, "message_required");
  if (message.length > MAX_MESSAGE_CHARS) return bad(400, "message_too_long");

  const phoneNumber = normalizePhoneNumber(phoneRaw);
  if (!/^\d{10,15}$/.test(phoneNumber)) {
    return bad(400, "phone_number_invalid");
  }

  // ── 3) Outbound to Evolution ───────────────────────────────────────────
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return bad(500, "evolution_not_configured");
  }
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE_NAME)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: EVOLUTION_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number: phoneNumber, text: message }),
    });
  } catch (e) {
    const detail = (e as Error).message || "network_error";
    return bad(502, `evolution_unreachable: ${detail.slice(0, 120)}`);
  }
  const text = await res.text();
  if (!res.ok) {
    // Do NOT echo the response body — it can contain the message text.
    // We log only the last 4 digits of the phone + the status code.
    const masked = `***${phoneNumber.slice(-4)}`;
    console.error("evolution send failed", { status: res.status, to: masked });
    return bad(502, `evolution_send_failed: ${res.status}`);
  }

  // Best-effort: pull the Evolution message id from the response so callers
  // can cross-link it. Different Evolution versions return different shapes.
  let messageId: string | null = null;
  try {
    const j = JSON.parse(text);
    messageId = (j?.key?.id || j?.messageId || j?.id) ? String(j.key?.id || j.messageId || j.id) : null;
  } catch { /* non-JSON response is fine; we still 200 */ }

  return new Response(
    JSON.stringify({ success: true, message_id: messageId }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});