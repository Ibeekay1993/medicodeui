// supabase/functions/whatsapp-webhook/index.ts
//
// Inbound webhook for Evolution API v2.x (Baileys provider).
//
// Security model:
//   - Group messages are silently ignored at the very first check.
//   - Every inbound direct message is retained for audit/reliability.
//   - Three access classes are resolved from hospital_whatsapp_contacts:
//       REGISTERED_HOSPITAL  → active registry match → authorization worker
//       GENERAL_CUSTOMER     → no registry match     → support / customer experience
//       DISABLED_OR_REVOKED  → exists but inactive   → treated as GENERAL_CUSTOMER for UX
//   - Hospital identity is determined from the sender phone, never from
//     message text, conversation context, or Gemini/AI.
//   - AI never grants or denies provider access.

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function unauthorized() { return jsonResponse({ error: "unauthorized" }, 401); }
function badRequest(reason: string) { return jsonResponse({ error: reason }, 400); }

// ── Group Message Detection ───────────────────────────────────────────────────
// Returns true for ANY WhatsApp group event (including broadcasts).
// Must be checked BEFORE any other processing so groups are completely silenced.
function isWhatsAppGroupMessage(body: any): boolean {
  if (!body || typeof body !== "object") return false;
  const data = body.data || body;
  const key = data?.key || {};
  const remoteJid = String(key.remoteJid || data.remoteJid || data.chatJid || "").toLowerCase();
  const participant = String(key.participant || data.participant || "").trim();

  // 1. Group JID (Baileys @g.us suffix)
  if (remoteJid.endsWith("@g.us") || remoteJid.includes("@g.us")) return true;
  // 2. Status / system broadcast JIDs
  if (remoteJid.includes("status@broadcast") || remoteJid.endsWith("@broadcast")) return true;
  // 3. Explicit isGroup flag from Evolution API
  if (Boolean(data.isGroup) || Boolean(body.isGroup)) return true;
  // 4. Participant present and different from remoteJid → group event
  if (participant.length > 0 && participant !== remoteJid && remoteJid.includes("@")) return true;

  return false;
}

// ── Access Class ─────────────────────────────────────────────────────────────
type AccessClass = "REGISTERED_HOSPITAL" | "GENERAL_CUSTOMER" | "DISABLED_OR_REVOKED";

async function resolveAccessClass(
  supabase: ReturnType<typeof getServiceClient>,
  phoneNumber: string,
): Promise<{ accessClass: AccessClass; authorized: boolean; hospitalId: string | null }> {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) return { accessClass: "GENERAL_CUSTOMER", authorized: false, hospitalId: null };

  // Load ALL contacts for this phone (any status) to distinguish unregistered vs revoked
  const { data, error } = await supabase
    .from("hospital_whatsapp_contacts")
    .select("hospital_id, phone_number, status")
    .limit(500);

  if (error) {
    console.error("evolution-webhook: access lookup failed", error.message);
    return { accessClass: "GENERAL_CUSTOMER", authorized: false, hospitalId: null };
  }

  const allMatches = (data || []).filter(
    (row: any) => normalizePhoneNumber(String(row.phone_number || "")) === normalized,
  );

  if (allMatches.length === 0) {
    return { accessClass: "GENERAL_CUSTOMER", authorized: false, hospitalId: null };
  }

  const activeMatches = allMatches.filter(
    (row: any) => String(row.status || "").toLowerCase() === "active",
  );

  if (activeMatches.length === 0) {
    return { accessClass: "DISABLED_OR_REVOKED", authorized: false, hospitalId: null };
  }

  const hospitals = [
    ...new Set(activeMatches.map((row: any) => String(row.hospital_id)).filter(Boolean)),
  ];
  if (hospitals.length !== 1) {
    return { accessClass: "GENERAL_CUSTOMER", authorized: false, hospitalId: null };
  }

  return { accessClass: "REGISTERED_HOSPITAL", authorized: true, hospitalId: hospitals[0] };
}

// ── WhatsApp Outbound Send ───────────────────────────────────────────────────
async function sendWhatsApp(toPhone: string, text: string): Promise<void> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    console.warn("evolution-webhook: Evolution creds missing; outbound message not sent");
    return;
  }
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE_NAME)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ number: toPhone, text }),
    });
    if (!res.ok) {
      const rb = await res.text();
      console.error("evolution-webhook: outbound send failed", res.status, rb.slice(0, 200));
    }
  } catch (err) {
    console.error("evolution-webhook: outbound send threw", (err as Error).message);
  }
}

// ── Message Content Extractor ─────────────────────────────────────────────────
function extractMessageContent(
  message: Record<string, unknown> | null | undefined,
): { text: string; type: string; mediaUrl: string | null } {
  if (!message || typeof message !== "object") return { text: "", type: "unknown", mediaUrl: null };
  if (typeof message.conversation === "string" && message.conversation.length)
    return { text: message.conversation, type: "text", mediaUrl: null };
  const ext = (message as Record<string, Record<string, unknown>>).extendedTextMessage;
  if (ext && typeof ext.text === "string") return { text: ext.text, type: "text", mediaUrl: null };
  const img = (message as Record<string, Record<string, unknown>>).imageMessage;
  if (img)
    return {
      text: typeof img.caption === "string" && img.caption ? img.caption : "[image]",
      type: "image",
      mediaUrl: typeof img.url === "string" ? img.url : null,
    };
  const doc = (message as Record<string, Record<string, unknown>>).documentMessage;
  if (doc)
    return {
      text: typeof doc.fileName === "string" ? doc.fileName : "[document]",
      type: "document",
      mediaUrl: typeof doc.url === "string" ? doc.url : null,
    };
  if ((message as Record<string, unknown>).audioMessage) return { text: "[audio]", type: "audio", mediaUrl: null };
  if ((message as Record<string, unknown>).videoMessage) return { text: "[video]", type: "video", mediaUrl: null };
  if ((message as Record<string, unknown>).stickerMessage) return { text: "[sticker]", type: "sticker", mediaUrl: null };
  if ((message as Record<string, unknown>).locationMessage) return { text: "[location]", type: "location", mediaUrl: null };
  if ((message as Record<string, unknown>).contactMessage) return { text: "[contact]", type: "contact", mediaUrl: null };
  return { text: "", type: "unknown", mediaUrl: null };
}

// ── Non-Registered Intent Detection ──────────────────────────────────────────
type NonRegisteredIntent =
  | "POTENTIAL_PROVIDER"
  | "PROVIDER_REGISTRATION"
  | "CALLBACK_REQUEST"
  | "SUPPORT_REQUEST"
  | "FAQ"
  | "GREETING";

function classifyNonRegisteredIntent(
  text: string,
  isPotentialProvider: boolean = false,
): NonRegisteredIntent {
  const t = (text || "").trim().toLowerCase();
  if (!t) return "GREETING";

  // 1. Explicit provider registration phrasing
  const registrationPhrases = [
    "register my hospital", "register this number", "register our hospital",
    "how do i register", "how to register", "i want to register",
    "want to register", "need to register", "get access",
    "get provider access", "need provider access", "hospital access",
    "clinic access", "onboard", "sign up as a provider", "join as provider",
    "provider registration",
  ];
  if (registrationPhrases.some((p) => t.includes(p))) return "PROVIDER_REGISTRATION";

  // 2. Potential provider keywords
  const providerKeywords = [
    "i am a doctor", "i am doctor", "i'm a doctor", "i am from",
    "i'm from a hospital", "i'm a hospital", "i am a hospital",
    "from uch", "from luth", "from a clinic", "from a hospital",
    "i work at a hospital", "healthcare provider", "medical director",
    "hospital administrator", "we are a hospital", "we are a clinic",
    "submit authorization", "submit an authorization", "submit preauthorization",
    "submit pre-authorization", "preauth", "pre-auth", "i want to submit",
    "how do i submit", "authorization request", "auth request",
  ];
  if (providerKeywords.some((kw) => t.includes(kw))) return "POTENTIAL_PROVIDER";

  // 3. Provider information phrasing
  const providerInfoPhrases = [
    "provider information", "provider info", "how does authorization work",
    "how does the authorization process work", "authorization process",
    "what is required to register",
  ];
  if (providerInfoPhrases.some((p) => t.includes(p))) return "FAQ";

  // 4. Context-sensitive menu numbering
  if (isPotentialProvider) {
    // 1️⃣ Provider Registration
    if (t === "1" || t === "1️⃣" || t.startsWith("1.") || t.startsWith("option 1")) {
      return "PROVIDER_REGISTRATION";
    }
    // 2️⃣ Chat with Customer Support
    if (t === "2" || t === "2️⃣" || t.startsWith("2.") || t.startsWith("option 2")) {
      return "SUPPORT_REQUEST";
    }
    // 3️⃣ Request a Phone Call
    if (t === "3" || t === "3️⃣" || t.startsWith("3.") || t.startsWith("option 3")) {
      return "CALLBACK_REQUEST";
    }
    // 4️⃣ Provider Information
    if (t === "4" || t === "4️⃣" || t.startsWith("4.") || t.startsWith("option 4")) {
      return "FAQ";
    }
    // 5️⃣ General HMO Question
    if (t === "5" || t === "5️⃣" || t.startsWith("5.") || t.startsWith("option 5")) {
      return "FAQ";
    }
  } else {
    // General Customer Menu:
    // 1️⃣ Chat with Customer Support
    if (t === "1" || t === "1️⃣" || t.startsWith("1.") || t.startsWith("option 1")) {
      return "SUPPORT_REQUEST";
    }
    // 2️⃣ Request a Phone Call
    if (t === "2" || t === "2️⃣" || t.startsWith("2.") || t.startsWith("option 2")) {
      return "CALLBACK_REQUEST";
    }
    // 3️⃣ Ask a General HMO Question
    if (t === "3" || t === "3️⃣" || t.startsWith("3.") || t.startsWith("option 3")) {
      return "FAQ";
    }
  }

  // 5. Natural language matching
  if (/\b(?:request\s+(?:a\s+)?(?:phone\s+)?call|call\s*me|call\s*back|callback|phone\s*call|someone\s+call)\b/i.test(t)) {
    return "CALLBACK_REQUEST";
  }

  if (/\b(?:chat\s+with\s+(?:customer\s+)?support|customer\s*support|human\s*agent|support\s*team|help\s*desk|speak\s+with\s+(?:an?\s+)?agent|representative|i\s+need\s+(?:support|help)|need\s+(?:support|help)|get\s+help)\b/i.test(t)) {
    return "SUPPORT_REQUEST";
  }

  if (/\b(?:general\s+question|general\s+hmo|benefits|services|plans|coverage|what\s+does\s+ronsberger|tell\s+me\s+about)\b/i.test(t)) {
    return "FAQ";
  }

  return "GREETING";
}

// ── Support Ticket / Conversation Creation (no auth.uid() needed) ─────────────
async function findOrCreateWhatsAppSupportConversation(
  supabase: ReturnType<typeof getServiceClient>,
  phoneNumber: string,
  pushName: string | null,
  callbackRequested: boolean,
  initialMessage: string,
  department: string,
  subject: string,
  customTags?: string[],
  ticketType?: string,
): Promise<string | null> {
  const defaultTag = `whatsapp:${phoneNumber}`;
  const tags = customTags && customTags.length ? customTags : [defaultTag];

  // Look for an existing open conversation for this phone
  const { data: existing } = await supabase
    .from("support_conversations")
    .select("id, status")
    .contains("tags", [defaultTag])
    .in("status", ["new", "open", "pending", "pending_customer_response", "reopened"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    const convId = existing[0].id;
    await supabase.from("support_messages").insert({
      conversation_id: convId,
      sender_id: null,
      sender_role: "customer",
      sender_name: pushName || `WhatsApp ...${phoneNumber.slice(-4)}`,
      body: initialMessage,
      is_internal: false,
      message_type: "message",
    });
    return convId;
  }

  const { data: conv, error } = await supabase
    .from("support_conversations")
    .insert({
      subject,
      department,
      priority: callbackRequested ? "high" : "normal",
      status: "new",
      tags,
      ticket_type: ticketType || (callbackRequested ? "callback_request" : "general_support"),
      request_metadata: {
        phone_number: phoneNumber,
        push_name: pushName || null,
        source: "whatsapp",
        callback_requested: callbackRequested,
        ticket_type: ticketType || (callbackRequested ? "callback_request" : "general_support"),
      },
    })
    .select("id")
    .single();

  if (error || !conv) {
    console.error("evolution-webhook: support_conversation insert failed", error?.message);
    return null;
  }

  await supabase.from("support_messages").insert({
    conversation_id: conv.id,
    sender_id: null,
    sender_role: "customer",
    sender_name: pushName || `WhatsApp ...${phoneNumber.slice(-4)}`,
    body: initialMessage,
    is_internal: false,
    message_type: "message",
  });

  return conv.id;
}

// ── Non-Registered / General Customer Handler ─────────────────────────────────
async function handleNonRegisteredUser(
  supabase: ReturnType<typeof getServiceClient>,
  phoneNumber: string,
  pushName: string | null,
  text: string,
  accessClass: AccessClass,
): Promise<void> {
  // Determine if this user is in a potential provider context:
  // 1. Contact in registry was disabled or revoked
  // 2. Current message has provider phrasing
  // 3. User previously sent a message with provider phrasing
  let isPotentialProvider =
    accessClass === "DISABLED_OR_REVOKED" ||
    /\b(?:doctor|hospital|clinic|uch|luth|preauth|authorization|provider|medical director)\b/i.test(text);

  if (!isPotentialProvider) {
    const { data: recentMsgs } = await supabase
      .from("whatsapp_messages")
      .select("message_body")
      .eq("phone_number", phoneNumber)
      .order("received_at", { ascending: false })
      .limit(3);
    if (recentMsgs && recentMsgs.some((m: any) => /\b(?:doctor|hospital|clinic|uch|luth|preauth|authorization|provider|medical director)\b/i.test(String(m.message_body || "")))) {
      isPotentialProvider = true;
    }
  }

  const intent = classifyNonRegisteredIntent(text, isPotentialProvider);

  if (intent === "CALLBACK_REQUEST") {
    const convId = await findOrCreateWhatsAppSupportConversation(
      supabase,
      phoneNumber,
      pushName,
      true,
      text || "Phone callback requested via WhatsApp",
      "General Support",
      `📞 Callback Request — WhatsApp ...${phoneNumber.slice(-4)}`,
      ["whatsapp", "callback_requested", `whatsapp:${phoneNumber}`],
      "callback_request",
    );
    if (convId) {
      await supabase.from("support_messages").insert({
        conversation_id: convId,
        sender_id: null,
        sender_role: "system",
        sender_name: "WhatsApp Bot",
        body: `📞 CALLBACK REQUESTED\n\nWhatsApp: ...${phoneNumber.slice(-4)}\nName: ${pushName || "Unknown"}\nSource: WhatsApp\n\nThis customer has requested a phone callback. Please call them back as soon as possible.`,
        is_internal: true,
        message_type: "internal_note",
      });
    }
    await sendWhatsApp(
      phoneNumber,
      "Thank you. Your request for a phone call has been received. 📞\n\nA Ronsberger Customer Support representative will contact you by phone as soon as possible.\n\nIf you have additional information to share, please reply here.\n\n— Ronsberger HMO",
    );
    return;
  }

  if (intent === "SUPPORT_REQUEST") {
    await findOrCreateWhatsAppSupportConversation(
      supabase,
      phoneNumber,
      pushName,
      false,
      text || "Customer requested support via WhatsApp",
      "General Support",
      `💬 WhatsApp Support — ...${phoneNumber.slice(-4)}`,
      ["whatsapp", `whatsapp:${phoneNumber}`],
      "general_support",
    );
    await sendWhatsApp(
      phoneNumber,
      "You're now connected with Ronsberger Customer Support. 💬\n\nA representative will respond to you here on WhatsApp shortly. Please feel free to share your question or message below.\n\n— Ronsberger HMO",
    );
    return;
  }

  if (intent === "PROVIDER_REGISTRATION") {
    const convId = await findOrCreateWhatsAppSupportConversation(
      supabase,
      phoneNumber,
      pushName,
      false,
      text || "Provider registration request",
      "WhatsApp Support",
      `🏥 Provider Registration Request — ...${phoneNumber.slice(-4)}`,
      ["whatsapp", "provider_registration", `whatsapp:${phoneNumber}`],
      "provider_registration",
    );
    if (convId) {
      await supabase.from("support_messages").insert({
        conversation_id: convId,
        sender_id: null,
        sender_role: "system",
        sender_name: "WhatsApp Bot",
        body: `🏥 PROVIDER REGISTRATION REQUEST\n\nWhatsApp: ...${phoneNumber.slice(-4)}\nName: ${pushName || "Unknown"}\nSource: WhatsApp\nCategory: Provider Registration\n\nThis WhatsApp number is requesting healthcare provider registration. Please verify facility details and process their registration.`,
        is_internal: true,
        message_type: "internal_note",
      });
    }
    await sendWhatsApp(
      phoneNumber,
      "Thank you for your interest in joining Ronsberger HMO's provider network. 🏥\n\nYour registration request has been received. A member of our Provider Relations team will be in touch with you shortly.\n\nTo help us process your request, please reply with:\n• Your hospital or clinic name\n• Your city/state\n• Your Medical Director's name\n\n— Ronsberger HMO",
    );
    return;
  }

  if (intent === "FAQ") {
    await sendWhatsApp(
      phoneNumber,
      isPotentialProvider
        ? "Ronsberger HMO works with a network of registered healthcare providers across Nigeria. 🏥\n\nTo use the provider authorization portal, hospitals and clinics must be registered and using their official WhatsApp number.\n\nWe can help with:\n• Provider registration requirements\n• Authorization process overview\n• HMO network details\n\nWhat would you like to do next?\n• Reply '1' for Provider Registration\n• Reply '2' to chat with Customer Support\n• Reply '3' to request a phone call\n\n— Ronsberger HMO"
        : "Ronsberger HMO provides comprehensive healthcare coverage, wellness services and medical support. 🩺\n\nWe can help with:\n• Benefit and coverage questions\n• Provider information\n• Member services\n\nReply with your question and we'll help! Or:\n• Reply '1' to chat with Customer Support\n• Reply '2' to request a phone call\n\n— Ronsberger HMO",
    );
    return;
  }

  if (intent === "POTENTIAL_PROVIDER") {
    await sendWhatsApp(
      phoneNumber,
      "Welcome to Ronsberger HMO 👋\n\nWe support healthcare providers with medical authorization and HMO services.\n\nThis WhatsApp number is not currently registered for provider authorization, but we can still help you.\n\nWhat would you like to do?\n\n1️⃣ Provider Registration\n2️⃣ Chat with Customer Support\n3️⃣ Request a Phone Call\n4️⃣ Provider Information\n5️⃣ General HMO Question\n\nIf you're contacting us on behalf of a hospital or clinic, our support team can assist with registration.\n\n— Ronsberger HMO",
    );
    return;
  }

  // Default GREETING
  if (isPotentialProvider) {
    await sendWhatsApp(
      phoneNumber,
      "Welcome to Ronsberger HMO 👋\n\nWe support healthcare providers with medical authorization and HMO services.\n\nThis WhatsApp number is not currently registered for provider authorization, but we can still help you.\n\nWhat would you like to do?\n\n1️⃣ Provider Registration\n2️⃣ Chat with Customer Support\n3️⃣ Request a Phone Call\n4️⃣ Provider Information\n5️⃣ General HMO Question\n\nIf you're contacting us on behalf of a hospital or clinic, our support team can assist with registration.\n\n— Ronsberger HMO",
    );
  } else {
    await sendWhatsApp(
      phoneNumber,
      "Welcome to Ronsberger HMO 👋\n\nWe're here to help with your HMO questions, benefits, services and support.\n\nHow can we help you today?\n\n1️⃣ Chat with Customer Support\n2️⃣ Request a Phone Call\n3️⃣ Ask a General HMO Question\n\n— Ronsberger HMO",
    );
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────
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
  if (instance && instance !== EVOLUTION_INSTANCE_NAME) {
    return jsonResponse({ ok: true, ignored: "instance_mismatch" });
  }

  // ── STEP 1: SILENTLY IGNORE ALL GROUP MESSAGES ────────────────────────────
  if (isWhatsAppGroupMessage(body)) {
    console.log("evolution-webhook: WhatsApp group message ignored");
    return jsonResponse({ ok: true, ignored: "group_message" });
  }

  const key = data.key || {};
  const remoteJid: string = String(key.remoteJid || "");
  const fromMe: boolean = Boolean(key.fromMe);
  const evolutionMessageId: string = String(key.id || "");

  if (fromMe) return jsonResponse({ ok: true, ignored: "from_me" });
  if (!remoteJid || !evolutionMessageId) return badRequest("missing_remote_jid_or_id");
  if (remoteJid.includes("status@broadcast")) return jsonResponse({ ok: true, ignored: "status_broadcast" });

  const rawMsg = data.message || {};
  if (rawMsg.reactionMessage || rawMsg.protocolMessage || rawMsg.senderKeyDistributionMessage) {
    return jsonResponse({ ok: true, ignored: "protocol_or_reaction_event" });
  }

  const { text, type, mediaUrl } = extractMessageContent(data.message);
  const phoneNumber = normalizePhoneNumber(remoteJid);
  const pushName = typeof data.pushName === "string" ? data.pushName : null;
  const messageTimestamp = Number(data.messageTimestamp);
  const receivedAt =
    Number.isFinite(messageTimestamp) && messageTimestamp > 0
      ? new Date(messageTimestamp * 1000).toISOString()
      : new Date().toISOString();

  const supabase = getServiceClient();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // ── STEP 2: RESOLVE ACCESS CLASS ─────────────────────────────────────────
  const { accessClass, authorized, hospitalId } = await resolveAccessClass(supabase, phoneNumber);

  // ── STEP 3: STORE MESSAGE ─────────────────────────────────────────────────
  const insertRow: Record<string, unknown> = {
    message_id: evolutionMessageId,
    phone_number: phoneNumber,
    message_type: type,
    message_body: text || null,
    raw_message: { event: body.event, instance: body.instance, data, pushName },
    status: authorized ? "queued" : "completed",
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

  // ── STEP 4: ROUTE BY ACCESS CLASS ────────────────────────────────────────
  if (authorized && accessClass === "REGISTERED_HOSPITAL") {
    // Fan out to AI authorization worker — only REGISTERED_HOSPITAL reaches here
    if (supabaseUrl && serviceKey) {
      try {
        const whHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        };
        if (WORKER_SECRET) whHeaders["x-worker-secret"] = WORKER_SECRET;
        fetch(`${supabaseUrl}/functions/v1/whatsapp-worker`, {
          method: "POST",
          headers: whHeaders,
          body: JSON.stringify({ message_id: evolutionMessageId, trigger: "evolution_webhook" }),
        }).catch((e) => console.error("worker invoke failed", e?.message || String(e)));
      } catch (e) {
        console.error("worker invoke threw", (e as Error).message);
      }
    }
    return jsonResponse({ ok: true, access: "registered_hospital" });
  }

  // GENERAL_CUSTOMER or DISABLED_OR_REVOKED — professional friendly experience
  try {
    await handleNonRegisteredUser(supabase, phoneNumber, pushName, text || "", accessClass);
  } catch (e) {
    console.error("evolution-webhook: non-registered handler threw", (e as Error).message);
  }

  return jsonResponse({ ok: true, access: accessClass.toLowerCase() });
});
