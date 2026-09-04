// supabase/functions/whatsapp-webhook/index.ts
//
// Inbound webhook for Evolution API v2.x (Baileys provider).
//
// Evolution does NOT auto-attach the global `apikey` to outbound webhook POSTs.
// Instead, at instance registration you can declare `webhook.headers` and
// Evolution will pass those headers through verbatim on every event. We rely on
// a shared secret header `X-Webhook-Token` for authentication. The same value
// must be configured on the Evolution instance (see docs/evolution-integration.md).
//
// Payload shape (Evolution v2.x, Baileys):
//   { "event": "MESSAGES_UPSERT",
//     "instance": "medicode-test",
//     "data": {
//        "key":  { "remoteJid": "2348012345678@s.whatsapp.net", "fromMe": false, "id": "3EB0..." },
//        "pushName": "Adewale",
//        "message": { "conversation": "..." } | { "extendedTextMessage": { "text": "..." } } |
//                   { "imageMessage": { "caption": "...", "mimetype": "..." } } | ...
//        "messageType": "conversation" | "extendedTextMessage" | "imageMessage" | ...,
//        "messageTimestamp": 1709553296
//     },
//     "date_time": "...",
//     "sender": "2348012345678@s.whatsapp.net",
//     "server_url": "...",
//     "apikey": "<configured at instance level>"
//   }
//
// We do not require `apikey` on the wire because Evolution does not reliably
// forward it (it appears in the JSON body, not as an HTTP header, on v2.x).
// The X-Webhook-Token header is the canonical authentication.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
};

const EVOLUTION_WEBHOOK_TOKEN = Deno.env.get("EVOLUTION_WEBHOOK_TOKEN") || "";
const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME") || "medicode-test";
const WORKER_SECRET = Deno.env.get("WHATSAPP_WORKER_SECRET") || "";
// Hard cap on body size. Evolution `messages.set` can be tens of MB; we don't
// need that for inbound text. 256 KB is generous for a single WhatsApp message.
const MAX_BODY_BYTES = 256 * 1024;

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function normalizePhoneNumber(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.length === 10) return "234" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "234" + digits.slice(1);
  return digits;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function unauthorized() {
  return jsonResponse({ error: "unauthorized" }, 401);
}

function badRequest(reason: string) {
  return jsonResponse({ error: reason }, 400);
}

/**
 * Extract human-readable text from an Evolution v2 message envelope.
 * Returns { text, type, mediaUrl } where text is the best available caption
 * or body, type is the message-type tag, mediaUrl is the media link if any.
 *
 * Evolution (Baileys) carries message content in one of several keys; we walk
 * them in priority order. We never return the raw message object — that
 * prevents accidental logging of full bodies via later code paths.
 */
function extractMessageContent(message: Record<string, unknown> | null | undefined): {
  text: string;
  type: string;
  mediaUrl: string | null;
} {
  if (!message || typeof message !== "object") {
    return { text: "", type: "unknown", mediaUrl: null };
  }
  // Plain text
  if (typeof message.conversation === "string" && message.conversation.length) {
    return { text: message.conversation, type: "text", mediaUrl: null };
  }
  // Quoted / forwarded text
  const ext = (message as Record<string, Record<string, unknown>>).extendedTextMessage;
  if (ext && typeof ext.text === "string") {
    return { text: ext.text, type: "text", mediaUrl: null };
  }
  // Image with optional caption
  const img = (message as Record<string, Record<string, unknown>>).imageMessage;
  if (img) {
    const caption = typeof img.caption === "string" ? img.caption : "";
    return {
      text: caption || "[image]",
      type: "image",
      mediaUrl: typeof img.url === "string" ? img.url : null,
    };
  }
  // Document
  const doc = (message as Record<string, Record<string, unknown>>).documentMessage;
  if (doc) {
    const name = typeof doc.fileName === "string" ? doc.fileName : "[document]";
    return {
      text: name,
      type: "document",
      mediaUrl: typeof doc.url === "string" ? doc.url : null,
    };
  }
  // Audio / voice
  if ((message as Record<string, unknown>).audioMessage) {
    return { text: "[audio]", type: "audio", mediaUrl: null };
  }
  // Video
  if ((message as Record<string, unknown>).videoMessage) {
    return { text: "[video]", type: "video", mediaUrl: null };
  }
  // Sticker
  if ((message as Record<string, unknown>).stickerMessage) {
    return { text: "[sticker]", type: "sticker", mediaUrl: null };
  }
  // Location / contact / poll — we don't extract structured content
  if ((message as Record<string, unknown>).locationMessage) {
    return { text: "[location]", type: "location", mediaUrl: null };
  }
  if ((message as Record<string, unknown>).contactMessage) {
    return { text: "[contact]", type: "contact", mediaUrl: null };
  }
  return { text: "", type: "unknown", mediaUrl: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") {
    // Health check. Evolution does not require a handshake, so this is a simple
    // liveness endpoint. It does NOT leak whether the shared secret is valid.
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ── 1) Body-size guard ───────────────────────────────────────────────────
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }

  // ── 2) Authentication ────────────────────────────────────────────────────
  // Fails closed if the secret is not configured.
  if (!EVOLUTION_WEBHOOK_TOKEN) {
    console.error("evolution-webhook: EVOLUTION_WEBHOOK_TOKEN not configured");
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }
  const provided = req.headers.get("x-webhook-token") || "";
  // Constant-time-ish compare; same length assumed (HMAC-shaped secrets are
  // fixed-width hex strings).
  let diff = provided.length ^ EVOLUTION_WEBHOOK_TOKEN.length;
  const min = Math.min(provided.length, EVOLUTION_WEBHOOK_TOKEN.length);
  for (let i = 0; i < min; i++) diff |= provided.charCodeAt(i) ^ EVOLUTION_WEBHOOK_TOKEN.charCodeAt(i);
  if (diff !== 0) return unauthorized();

  // ── 3) Parse body ────────────────────────────────────────────────────────
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return badRequest("invalid_json");
  }

  const event = String(body?.event || "")
    .toUpperCase()
    .replace(/\./g, "_");
  const instance = String(body?.instance || "");
  const data = body?.data;

  // We only care about MESSAGES_UPSERT for inbound message intake.
  // Evolution may send the event as "messages.upsert" or "MESSAGES_UPSERT".
  // Acknowledge everything else with 200 so Evolution does not retry.
  if (event !== "MESSAGES_UPSERT") {
    return jsonResponse({ ok: true, ignored: event });
  }
  if (!data || typeof data !== "object") {
    return badRequest("missing_data");
  }
  if (instance && instance !== EVOLUTION_INSTANCE_NAME) {
    // Mismatched instance. Accept and log minimally, but do not enqueue.
    return jsonResponse({ ok: true, ignored: "instance_mismatch", expected: EVOLUTION_INSTANCE_NAME, got: instance });
  }

  const key = data.key || {};
  const remoteJid: string = String(key.remoteJid || "");
  const fromMe: boolean = Boolean(key.fromMe);
  const evolutionMessageId: string = String(key.id || "");
  if (fromMe) {
    // Echo of our own outbound — ignore.
    return jsonResponse({ ok: true, ignored: "from_me" });
  }
  if (!remoteJid || !evolutionMessageId) {
    return badRequest("missing_remote_jid_or_id");
  }

  // Skip group messages and status broadcasts
  if (remoteJid.endsWith("@g.us") || remoteJid.includes("status@broadcast")) {
    return jsonResponse({ ok: true, ignored: "group_or_status_broadcast" });
  }

  // Filter out WhatsApp system events (reactions, protocol notifications)
  const rawMsg = data.message || {};
  if (rawMsg.reactionMessage || rawMsg.protocolMessage || rawMsg.senderKeyDistributionMessage) {
    return jsonResponse({ ok: true, ignored: "protocol_or_reaction_event" });
  }

  const { text, type, mediaUrl } = extractMessageContent(data.message);
  const phoneNumber = normalizePhoneNumber(remoteJid);
  const pushName = typeof data.pushName === "string" ? data.pushName : null;
  const messageTimestamp = Number(data.messageTimestamp);
  const receivedAt = Number.isFinite(messageTimestamp) && messageTimestamp > 0
    ? new Date(messageTimestamp * 1000).toISOString()
    : new Date().toISOString();

  // ── 4) Enqueue (idempotent) ─────────────────────────────────────────────
  const supabase = getServiceClient();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // The full Evolution envelope goes into raw_message. message_body is the
  // best-effort text the worker will feed to Gemini. Do NOT log the envelope.
  const insertRow: Record<string, unknown> = {
    message_id: evolutionMessageId,
    phone_number: phoneNumber,
    message_type: type,
    message_body: text || null,
    raw_message: {
      event: body.event,
      instance: body.instance,
      data,
      pushName,
    },
    status: "queued",
    received_at: receivedAt,
    phone_number_id: instance || null,
  };
  // media_url was added in code but the production schema may not have it.
  // Try with media_url; if the column is missing, retry without it.
  let insErr: { message: string } | null = null;
  {
    const first = await supabase.from("whatsapp_messages").insert({ ...insertRow, media_url: mediaUrl });
    if (first.error && /media_url/.test(first.error.message)) {
      const second = await supabase.from("whatsapp_messages").insert(insertRow);
      insErr = second.error;
    } else {
      insErr = first.error;
    }
  }

  if (insErr && !String(insErr.message || "").toLowerCase().includes("duplicate")) {
    console.error("evolution-webhook: insert failed", insErr.message);
    return jsonResponse({ error: "insert_failed", detail: insErr.message }, 500);
  }

  // ── 5) Fan out to the worker (fire-and-forget) ───────────────────────────
  if (supabaseUrl && serviceKey) {
    try {
      const whHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      };
      // Mirror the worker shared secret so the worker doesn't 403 us.
      if (WORKER_SECRET) whHeaders["x-worker-secret"] = WORKER_SECRET;
      // Don't await — Evolution retries if we take >30s. Keep the response fast.
      fetch(`${supabaseUrl}/functions/v1/whatsapp-worker`, {
        method: "POST",
        headers: whHeaders,
        body: JSON.stringify({ message_id: evolutionMessageId, trigger: "evolution_webhook" }),
      }).catch((e) => console.error("worker invoke failed", e?.message || String(e)));
    } catch (e) {
      console.error("worker invoke threw", (e as Error).message);
    }
  }

  return jsonResponse({ ok: true });
});