const functions = require("firebase-functions");
const crypto = require("crypto");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// Capture raw body BEFORE Express parses it — needed for Meta signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// -- Configuration
const getConfig = () => {
  const cfg = functions.config();
  return {
    VERIFY_TOKEN:
      process.env.WHATSAPP_VERIFY_TOKEN ||
      (cfg.whatsapp && cfg.whatsapp.verify_token) ||
      "",
    APP_SECRET:
      process.env.META_APP_SECRET ||
      (cfg.whatsapp && cfg.whatsapp.app_secret) ||
      "",
    SUPABASE_URL:
      process.env.SUPABASE_URL ||
      (cfg.supabase && cfg.supabase.url) ||
      "",
    SUPABASE_SERVICE_ROLE_KEY:
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      (cfg.supabase && cfg.supabase.service_role_key) ||
      "",
  };
};

// -- CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-hub-signature-256",
};

function setCors(res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.set(k, v));
}

/**
 * Verify the X-Hub-Signature-256 header against the raw request body.
 * Meta computes sha256=<HMAC-SHA256 of raw body using app secret>.
 */
function verifySignature(req, appSecret) {
  const signature = req.get("x-hub-signature-256");
  if (!signature || !appSecret) return false;

  const rawBody = req.rawBody;
  if (!rawBody) return false;

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", appSecret)
      .update(rawBody)
      .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Normalize phone number to clean digits with 234 prefix.
 * Meta sends numbers in international format without +.
 */
function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.length === 10) return "234" + digits;
  if (digits.length === 11 && digits.startsWith("0")) return "234" + digits.slice(1);
  return digits;
}

/**
 * Extract text from a Meta webhook message payload.
 */
function extractMessageText(message) {
  const type = message.type;
  if (type === "text" && message.text) return message.text.body || "";
  if (type === "button" && message.button) return message.button.text || "";
  if (message.image) return message.image.caption || "[image received]";
  if (message.audio) return "[audio message received]";
  if (message.document) return message.document.filename || "[document received]";
  return JSON.stringify(message);
}

/**
 * Process a single webhook entry — extract message details and store in queue.
 */
async function processEntry(supabase, entry, phoneNumberId) {
  if (!entry.messages || !Array.isArray(entry.messages)) return;

  for (const message of entry.messages) {
    const messageId = message.id;
    if (!messageId) continue;

    // Idempotency — skip if already stored
    const { data: existing } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("message_id", messageId)
      .maybeSingle();

    if (existing) {
      functions.logger.info(`Duplicate message ${messageId} — skipping.`);
      continue;
    }

    const from = normalizePhone(message.from || "");
    const messageType = message.type || "text";
    const messageText = extractMessageText(message);
    const receivedAt = message.timestamp
      ? new Date(parseInt(message.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    const rawMessage = JSON.stringify({
      id: messageId,
      from: from,
      from_raw: message.from,
      type: messageType,
      text: messageText,
      timestamp: receivedAt,
      phone_number_id: phoneNumberId,
      waba_id: entry.id,
    });

    const { error: insertError } = await supabase
      .from("whatsapp_messages")
      .insert({
        message_id: messageId,
        phone_number: from,
        message_type: messageType,
        message_body: messageText,
        raw_message: rawMessage,
        status: "received",
        received_at: receivedAt,
        phone_number_id: String(phoneNumberId || ""),
      });

    if (insertError) {
      functions.logger.error(`Failed to store message ${messageId}:`, insertError);
    } else {
      functions.logger.info(`Queued message ${messageId} from ${from} for processing.`);
    }
  }
}

/**
 * Process status updates (sent, delivered, read, failed).
 */
async function processStatuses(supabase, statuses) {
  for (const status of statuses) {
    const messageId = status.id;
    const newStatus = status.status;
    const timestamp = status.timestamp
      ? new Date(parseInt(status.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    const { error: updateError } = await supabase
      .from("whatsapp_messages")
      .update({
        status: newStatus,
        status_updated_at: timestamp,
      })
      .eq("message_id", messageId);

    if (updateError) {
      functions.logger.error(`Failed to update status for ${messageId}:`, updateError);
    } else {
      functions.logger.info(`Status updated for ${messageId}: ${newStatus}`);
    }
  }
}

// === HTTP Handler ===
app.all("/webhook/whatsapp", async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).send("OK");
  }

  const config = getConfig();

  // 1. Webhook verification (GET)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === config.VERIFY_TOKEN) {
      functions.logger.info("WhatsApp webhook verified successfully.");
      return res.status(200).send(challenge);
    }

    functions.logger.error("Webhook verification failed — token mismatch.");
    return res.status(403).send("Forbidden");
  }

  // 2. Incoming webhook payload (POST)
  if (req.method === "POST") {
    // Verify the request came from Meta
    if (!verifySignature(req, config.APP_SECRET)) {
      functions.logger.error("Invalid webhook signature — possible spoof attempt.");
      return res.status(403).send("Signature mismatch");
    }

    const body = req.body;
    functions.logger.info("Received WhatsApp webhook entry count:", (body.entry || []).length);

    const supabase = createClient(
      config.SUPABASE_URL,
      config.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // Meta may send entries in different shapes depending on webhook field subscriptions
    // entry[].changes[].value.messages  — for messages
    // entry[].changes[].value.statuses  — for status updates
    for (const entry of body.entry || []) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value || {};
        const phoneNumberId = entry.id || value.metadata?.phone_number_id;

        if (value.messages && Array.isArray(value.messages)) {
          await processEntry(supabase, value, phoneNumberId);
        }

        if (value.statuses && Array.isArray(value.statuses)) {
          await processStatuses(supabase, value.statuses);
        }
      }

      // Some payloads nest messages at entry level
      if (entry.messaging_product && entry.messages) {
        await processEntry(supabase, entry, entry.id);
      }
    }

    // Always respond with 200 quickly — Meta expects this within 20 seconds
    return res.status(200).json({ success: true });
  }

  return res.status(405).send("Method Not Allowed");
});

// Export for Firebase Functions
exports.whatsappWebhook = functions.https.onRequest(app);
