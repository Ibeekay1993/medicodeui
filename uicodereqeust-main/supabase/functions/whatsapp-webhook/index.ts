// supabase/functions/whatsapp-webhook/index.ts
//
// Inbound webhook for Evolution API v2.x (Baileys provider).
//
// Security model:
//   - Every inbound message is retained for audit/reliability.
//   - Only an ACTIVE entry in hospital_whatsapp_contacts is allowed to enter
//     the AI/authorization worker.
//   - Patients/unknown senders receive a generic restricted response and are
//     never fanned out to the worker.
//   - Hospital identity is determined from the sender phone, never from message
//     text, conversation context, or Gemini.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
};

const EVOLUTION_WEBHOOK_TOKEN = Deno.env.get("EVOLUTION_WEBHOOK_TOKEN") || "";
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME") || "medicode-test";
const WORKER_SECRET = Deno.env.get("WHATSAPP_WORKER_SECRET") || "";
const MAX_BODY_BYTES = 256 * 1024;
const PATIENT_RESTRICTED_REPLY =
  "This WhatsApp service is for registered healthcare providers. Patients and unregistered numbers cannot submit or track medical authorization requests through this channel. Please contact your healthcare provider for assistance.\n\n— Ronsberger HMO";

function getServiceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

function normalizePhoneNumber(raw: string): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) return "234" + digits.slice(1);
  if (digits.startsWith("234")) return digits;
  if (digits.length === 10) return "234" + digits;
  return digits;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function unauthorized() { return jsonResponse({ error: "unauthorized" }, 401); }
function badRequest(reason: string) { return jsonResponse({ error: reason }, 400); }

async function resolveHospitalSender(supabase: ReturnType<typeof getServiceClient>, phoneNumber: string) {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) return { authorized: false as const, reason: "phone_required" };

  // Do not compare raw stored formatting. Existing/admin-entered values may be
  // +234..., 234..., or local 080... format, so normalize both sides here.
  const { data, error } = await supabase
    .from("hospital_whatsapp_contacts")
    .select("id, hospital_id, contact_name, contact_role, phone_number, status")
    .eq("status", "active")
    .limit(500);

  if (error) {
    console.error("evolution-webhook: WhatsApp access lookup failed", error.message);
    return { authorized: false as const, reason: "identity_lookup_failed" };
  }

  const matches = (data || []).filter((row: any) => normalizePhoneNumber(String(row.phone_number || "")) === normalized);
  const hospitals = [...new Set(matches.map((row: any) => String(row.hospital_id)).filter(Boolean))];
  if (hospitals.length !== 1) {
    return { authorized: false as const, reason: hospitals.length > 1 ? "ambiguous_sender" : "unregistered_sender" };
  }

  const contact = matches.find((row: any) => String(row.hospital_id) === hospitals[0]);
  return {
    authorized: true as const,
    hospitalId: hospitals[0],
    contactId: contact?.id ? String(contact.id) : null,
    contactName: contact?.contact_name ? String(contact.contact_name) : null,
    contactRole: contact?.contact_role ? String(contact.contact_role) : null,
  };
}

async function sendRestrictedReply(toPhone: string) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    console.warn("evolution-webhook: Evolution credentials missing; restricted reply not sent");
    return;
  }
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE_NAME)}`;
  try {
    const response = await fetch(url, { method: "POST", headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ number: toPhone, text: PATIENT_RESTRICTED_REPLY }) });
    if (!response.ok) {
      const body = await response.text();
      console.error("evolution-webhook: restricted reply failed", response.status, body.slice(0, 200));
    }
  } catch (error) {
    console.error("evolution-webhook: restricted reply threw", (error as Error).message);
  }
}

function extractMessageContent(message: Record<string, unknown> | null | undefined): { text: string; type: string; mediaUrl: string | null } {
  if (!message || typeof message !== "object") return { text: "", type: "unknown", mediaUrl: null };
  if (typeof message.conversation === "string" && message.conversation.length) return { text: message.conversation, type: "text", mediaUrl: null };
  const ext = (message as Record<string, Record<string, unknown>>).extendedTextMessage;
  if (ext && typeof ext.text === "string") return { text: ext.text, type: "text", mediaUrl: null };
  const img = (message as Record<string, Record<string, unknown>>).imageMessage;
  if (img) return { text: typeof img.caption === "string" && img.caption ? img.caption : "[image]", type: "image", mediaUrl: typeof img.url === "string" ? img.url : null };
  const doc = (message as Record<string, Record<string, unknown>>).documentMessage;
  if (doc) return { text: typeof doc.fileName === "string" ? doc.fileName : "[document]", type: "document", mediaUrl: typeof doc.url === "string" ? doc.url : null };
  if ((message as Record<string, unknown>).audioMessage) return { text: "[audio]", type: "audio", mediaUrl: null };
  if ((message as Record<string, unknown>).videoMessage) return { text: "[video]", type: "video", mediaUrl: null };
  if ((message as Record<string, unknown>).stickerMessage) return { text: "[sticker]", type: "sticker", mediaUrl: null };
  if ((message as Record<string, unknown>).locationMessage) return { text: "[location]", type: "location", mediaUrl: null };
  if ((message as Record<string, unknown>).contactMessage) return { text: "[contact]", type: "contact", mediaUrl: null };
  return { text: "", type: "unknown", mediaUrl: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) return jsonResponse({ error: "payload_too_large" }, 413);
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return jsonResponse({ error: "payload_too_large" }, 413);

  if (!EVOLUTION_WEBHOOK_TOKEN) {
    console.error("evolution-webhook: EVOLUTION_WEBHOOK_TOKEN not configured");
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }
  const provided = req.headers.get("x-webhook-token") || "";
  let diff = provided.length ^ EVOLUTION_WEBHOOK_TOKEN.length;
  const min = Math.min(provided.length, EVOLUTION_WEBHOOK_TOKEN.length);
  for (let i = 0; i < min; i++) diff |= provided.charCodeAt(i) ^ EVOLUTION_WEBHOOK_TOKEN.charCodeAt(i);
  if (diff !== 0) return unauthorized();

  let body: any;
  try { body = JSON.parse(rawBody); } catch { return badRequest("invalid_json"); }
  const event = String(body?.event || "").toUpperCase().replace(/\./g, "_");
  const instance = String(body?.instance || "");
  const data = body?.data;
  if (event !== "MESSAGES_UPSERT") return jsonResponse({ ok: true, ignored: event });
  if (!data || typeof data !== "object") return badRequest("missing_data");
  if (instance && instance !== EVOLUTION_INSTANCE_NAME) return jsonResponse({ ok: true, ignored: "instance_mismatch", expected: EVOLUTION_INSTANCE_NAME, got: instance });

  const key = data.key || {};
  const remoteJid: string = String(key.remoteJid || "");
  const fromMe: boolean = Boolean(key.fromMe);
  const evolutionMessageId: string = String(key.id || "");
  if (fromMe) return jsonResponse({ ok: true, ignored: "from_me" });
  if (!remoteJid || !evolutionMessageId) return badRequest("missing_remote_jid_or_id");
  if (remoteJid.endsWith("@g.us") || remoteJid.includes("status@broadcast")) return jsonResponse({ ok: true, ignored: "group_or_status_broadcast" });

  const rawMsg = data.message || {};
  if (rawMsg.reactionMessage || rawMsg.protocolMessage || rawMsg.senderKeyDistributionMessage) return jsonResponse({ ok: true, ignored: "protocol_or_reaction_event" });

  const { text, type, mediaUrl } = extractMessageContent(data.message);
  const phoneNumber = normalizePhoneNumber(remoteJid);
  const pushName = typeof data.pushName === "string" ? data.pushName : null;
  const messageTimestamp = Number(data.messageTimestamp);
  const receivedAt = Number.isFinite(messageTimestamp) && messageTimestamp > 0 ? new Date(messageTimestamp * 1000).toISOString() : new Date().toISOString();

  const supabase = getServiceClient();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sender = await resolveHospitalSender(supabase, phoneNumber);

  const insertRow: Record<string, unknown> = {
    message_id: evolutionMessageId,
    phone_number: phoneNumber,
    message_type: type,
    message_body: text || null,
    raw_message: { event: body.event, instance: body.instance, data, pushName },
    status: sender.authorized ? "queued" : "completed",
    received_at: receivedAt,
    phone_number_id: instance || null,
  };

  let insErr: { message: string } | null = null;
  const first = await supabase.from("whatsapp_messages").insert({ ...insertRow, media_url: mediaUrl });
  if (first.error && /media_url/.test(first.error.message)) {
    const second = await supabase.from("whatsapp_messages").insert(insertRow);
    insErr = second.error;
  } else {
    insErr = first.error;
  }
  if (insErr && !String(insErr.message || "").toLowerCase().includes("duplicate")) {
    console.error("evolution-webhook: insert failed", insErr.message);
    return jsonResponse({ error: "insert_failed", detail: insErr.message }, 500);
  }

  if (!sender.authorized) {
    if (String(sender.reason) !== "identity_lookup_failed") await sendRestrictedReply(phoneNumber);
    return jsonResponse({ ok: true, restricted: true });
  }

  if (supabaseUrl && serviceKey) {
    try {
      const whHeaders: Record<string, string> = { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` };
      if (WORKER_SECRET) whHeaders["x-worker-secret"] = WORKER_SECRET;
      fetch(`${supabaseUrl}/functions/v1/whatsapp-worker`, { method: "POST", headers: whHeaders, body: JSON.stringify({ message_id: evolutionMessageId, trigger: "evolution_webhook" }) }).catch((e) => console.error("worker invoke failed", e?.message || String(e)));
    } catch (e) {
      console.error("worker invoke threw", (e as Error).message);
    }
  }
  return jsonResponse({ ok: true });
});
