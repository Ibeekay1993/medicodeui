// whatsapp-worker
//
// Triggered by:
//   - whatsapp-webhook (fan-out) for each new message
//   - cron job (e.g. SELECT … FROM whatsapp_messages WHERE status='queued' …) — backstop
//   - manual call: POST { message_id } or POST { poll: true }
//
// Pipeline (per message_id):
//   1) Mark 'processing'
//   2) Sanitize → Gemini 3 Flash extraction (NO raw PHI beyond what the patient typed)
//   3) POST to MEDAUTH internal /api/authorizations
//   4) Send WhatsApp template "auth_received" reply to the patient
//   5) Mark 'completed' or schedule retry with exponential backoff
//
// Free-tier notes:
//   - Gemini 1.5/2.x Flash free tier = 1500 RPD. We batch only one message at a time.
//   - Meta Cloud API free = 1000 service conversations/month (24h window).
//   - We never log full body text to console in production — only message_id + status.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
// Internal API target. Default to the supabase functions endpoint so the worker
// calls the `submit-authorization` Edge Function directly (no external hop).
// Override with MEDAUTH_INTERNAL_BASE_URL + MEDAUTH_INTERNAL_PATH if you deploy
// the API elsewhere.
const MEDAUTH_BASE_URL =
  Deno.env.get("MEDAUTH_INTERNAL_BASE_URL") || Deno.env.get("SUPABASE_URL") || "";
const MEDAUTH_INTERNAL_PATH = Deno.env.get("MEDAUTH_INTERNAL_PATH") || "/functions/v1/submit-authorization";
const MEDAUTH_API_KEY = Deno.env.get("MEDAUTH_INTERNAL_API_KEY") || "";
// Evolution API outbound transport. With a Baileys instance there are no
// templates — we call `sendText` with a plain string. The string is assembled
// in code from the variables the Meta template used to receive.
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME") || "medicode-test";
// Optional override of the default reply text. Useful for ops to A/B test
// wording without redeploying the function.
const AUTH_RECEIVED_TEXT = Deno.env.get("WHATSAPP_AUTH_RECEIVED_TEXT")
  || "Your medical authorization request has been received. Reference: {ticket}. We will review and get back to you shortly. — Ronsberger HMO";
const WORKER_SECRET = Deno.env.get("WHATSAPP_WORKER_SECRET") || "";
const MAX_ATTEMPTS = Number(Deno.env.get("WHATSAPP_MAX_ATTEMPTS") || "5");
const WORKER_BATCH = Number(Deno.env.get("WHATSAPP_WORKER_BATCH") || "10");

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function log(stage: string, message_id: string, status: "ok" | "error" | "skipped", detail?: unknown) {
  // Lightweight server log — never logs full message body
  const safe = detail && typeof detail === "object"
    ? { ...(detail as Record<string, unknown>), body_preview: undefined }
    : detail;
  console.log(JSON.stringify({ stage, message_id, status, ...((safe as object) || {}) }));
  // Persist audit row (fire and forget)
  getServiceClient().from("whatsapp_processing_log").insert({
    message_id, stage, status, detail: detail ?? null,
  }).then(() => {});
}

async function backoffSeconds(attempt: number): Promise<number> {
  // 30s, 1m, 2m, 4m, 8m (capped), plus jitter
  const base = Math.min(30 * Math.pow(2, Math.max(0, attempt - 1)), 8 * 60);
  const jitter = Math.floor(Math.random() * 15);
  return base + jitter;
}

// ── 1) Gemini extraction ─────────────────────────────────────────────────────
async function extractWithGemini(text: string): Promise<{
  patientName?: string;
  policyNumber?: string;
  diagnosis?: string;
  treatment?: string;
  patientPhone?: string;
  originatingHospital?: string;
  referralHospital?: string;
  patientId?: string;
  providerName?: string;
  procedureType?: string;
  urgencyLevel?: number;       // 1-5
  missingInfo?: string[];
  raw?: unknown;
}> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

  const systemPrompt = [
    "You are a medical authorization intake classifier for Ronsberger HMO.",
    "Extract structured clinical authorization fields from Nigerian hospital WhatsApp messages.",
    "Rules for extraction:",
    "1. patientName: The patient's full name (from 'Name:', '*Name*:', 'Full Name:', etc.).",
    "2. policyNumber: The NHIA/NHIS/Policy number (from 'NHIA no:', 'NHIS No:', 'Policy:', etc.).",
    "3. diagnosis: The medical diagnosis or complaint.",
    "4. treatment: The full list of requested drugs, dosages, investigations, or services.",
    "5. patientPhone: The patient or requester phone number if mentioned in the message text.",
    "6. originatingHospital: The hospital submitting or sending the request. CRITICAL ALIAS: If text says 'From University health services', 'FROM UNIVERSITY HEALTH SERVICE', 'Jaja clinic', or similar, set originatingHospital to 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)'.",
    "7. referralHospital: If the request is a referral (e.g., 'Referral To: UCH', 'Referred to: University College Hospital', 'Treatment at UCH'), set referralHospital to 'UNIVERSITY COLLEGE HOSPITAL'. Otherwise leave empty.",
    "8. urgencyLevel: 1=routine, 2=low, 3=standard, 4=urgent, 5=emergency.",
    "Return ONLY valid JSON matching the schema. No markdown, no prose.",
  ].join(" ");

  const schema = {
    type: "object",
    properties: {
      patientName: { type: "string" },
      policyNumber: { type: "string" },
      diagnosis: { type: "string" },
      treatment: { type: "string" },
      patientPhone: { type: "string" },
      originatingHospital: { type: "string" },
      referralHospital: { type: "string" },
      urgencyLevel: { type: "integer", minimum: 1, maximum: 5 },
      missingInfo: { type: "array", items: { type: "string" } },
    },
    required: ["urgencyLevel", "missingInfo"],
    additionalProperties: false,
  } as const;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!part) throw new Error("Gemini: empty response");
  const parsed = JSON.parse(part);
  if (typeof parsed.urgencyLevel === "number") {
    parsed.urgencyLevel = Math.max(1, Math.min(5, Math.round(parsed.urgencyLevel)));
  } else {
    parsed.urgencyLevel = 3;
  }
  parsed.missingInfo = Array.isArray(parsed.missingInfo) ? parsed.missingInfo.slice(0, 10) : [];
  parsed.raw = data;

  // Additional rule-based normalizer for hospital aliases
  const lowerText = text.toLowerCase();
  if (lowerText.includes("university health service") || lowerText.includes("jaja")) {
    parsed.originatingHospital = "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)";
  }
  if (lowerText.includes("uch") || lowerText.includes("university college hospital")) {
    if (lowerText.includes("referral") || lowerText.includes("referred") || lowerText.includes("refer to")) {
      parsed.referralHospital = "UNIVERSITY COLLEGE HOSPITAL";
    }
  }

  return parsed;
}

// ── 2) Internal API call ──────────────────────────────────────────────────────
async function postAuthorization(payload: Record<string, unknown>): Promise<{ id: string; status?: string; deduplicated?: boolean }> {
  const url = `${MEDAUTH_BASE_URL.replace(/\/$/, "")}${MEDAUTH_INTERNAL_PATH}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (MEDAUTH_API_KEY) headers["x-api-key"] = MEDAUTH_API_KEY;
  // Belt-and-braces: also pass the worker shared secret so the receiving function
  // can authenticate us even if the API key was rotated.
  const ws = Deno.env.get("WHATSAPP_WORKER_SECRET");
  if (ws) headers["x-worker-secret"] = ws;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`internal API ${res.status}: ${text.slice(0, 200)}`);
  try {
    const j = JSON.parse(text);
    if (!j?.id) throw new Error("internal API: missing id in response");
    return { id: String(j.id), status: j.status ? String(j.status) : undefined, deduplicated: Boolean(j.deduplicated) };
  } catch (e) {
    throw new Error(`internal API: bad JSON response: ${(e as Error).message}`);
  }
}

// ── 3) Evolution outbound reply (Baileys sendText) ───────────────────────
async function sendAuthReceivedTemplate(toPhoneE164: string, variables: Record<string, string>) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) throw new Error("Evolution creds missing");
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE_NAME)}`;
  const ticket = String(variables["1"] || "");
  const procedure = String(variables["2"] || "your request");
  const text = AUTH_RECEIVED_TEXT
    .replace("{ticket}", ticket)
    .replace("{procedure}", procedure);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: EVOLUTION_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ number: toPhoneE164, text }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`Evolution send ${res.status}: ${t.slice(0, 200)}`);
  try { return JSON.parse(t); } catch { return { raw: t }; }
}

// ── 4) Process one queued row ────────────────────────────────────────────────
async function processOne(supabase: ReturnType<typeof getServiceClient>, messageId: string) {
  // Claim the row atomically: queued|retry → processing. Rely on the unique message_id + a guard
  // that we're not in 'processing' (single-worker model per row due to small batch + cron backstop).
  const { data: row, error: selErr } = await supabase
    .from("whatsapp_messages")
    .select("id, message_id, phone_number, message_type, message_body, attempts, status, correlation_id, raw_message")
    .eq("message_id", messageId)
    .maybeSingle();
  if (selErr || !row) {
    log("load", messageId, "error", { error: selErr?.message });
    return;
  }
  if (row.status === "completed") return;       // idempotent: nothing to do
  if (row.status === "processing") {
    // Another worker has it. Bail.
    return;
  }

  const { error: claimErr } = await supabase
    .from("whatsapp_messages")
    .update({ status: "processing", attempts: (row.attempts ?? 0) + 1 })
    .eq("message_id", messageId)
    .in("status", ["queued", "retry"]);

  if (claimErr) {
    log("claim", messageId, "error", { error: claimErr.message });
    return;
  }

  // Only text messages are extracted. Media → reply with "please send as text" template would
  // be a future improvement; for now, send the auth_received template with a media note.
  let extracted: Awaited<ReturnType<typeof extractWithGemini>> | null = null;
  let extractError: string | null = null;
  try {
    if (row.message_type === "text" && row.message_body) {
      extracted = await extractWithGemini(row.message_body);
      await supabase.from("whatsapp_messages").update({ extracted }).eq("message_id", messageId);
      log("gemini", messageId, "ok", { urgency: extracted.urgencyLevel, missing: extracted.missingInfo?.length ?? 0 });
    } else {
      extracted = { urgencyLevel: 3, missingInfo: ["procedureType"] };
      log("gemini", messageId, "skipped", { reason: `non-text:${row.message_type}` });
    }
  } catch (e) {
    extractError = (e as Error).message;
    log("gemini", messageId, "error", { error: extractError });
  }

  // 3) Internal API
  let internalId: string | null = null;
  let internalError: string | null = null;
  if (extracted) {
    try {
      const payload = {
        source: "whatsapp",
        whatsapp_message_id: messageId,
        patient_name: extracted.patientName || null,
        policy_number: extracted.policyNumber || null,
        diagnosis: extracted.diagnosis || null,
        treatment: extracted.treatment || null,
        phone_number: extracted.patientPhone || row.phone_number,
        hospital_name: extracted.originatingHospital || null,
        referral_hospital_name: extracted.referralHospital || null,
        urgency_level: extracted.urgencyLevel ?? 3,
        missing_info: extracted.missingInfo ?? [],
        raw_message: row.message_body ?? null,
      };
      const r = await postAuthorization(payload);
      internalId = r.id;
      await supabase
        .from("whatsapp_messages")
        .update({ internal_request_id: r.id })
        .eq("message_id", messageId);
      log("internal_api", messageId, "ok", { id: r.id });
    } catch (e) {
      internalError = (e as Error).message;
      log("internal_api", messageId, "error", { error: internalError });
    }
  }

  // 4) Template reply (only if we at least got an internal id, or at minimum a correlation ref)
  const ticketRef = internalId || messageId.slice(-6).toUpperCase();
  let templateSent = false;
  let templateError: string | null = null;
  try {
    await sendAuthReceivedTemplate(row.phone_number, {
      "1": ticketRef,
      "2": extracted?.procedureType || "your request",
    });
    templateSent = true;
    await supabase
      .from("whatsapp_messages")
      .update({ template_sent_at: new Date().toISOString() })
      .eq("message_id", messageId);
    log("template_send", messageId, "ok", { ticket: ticketRef });
  } catch (e) {
    templateError = (e as Error).message;
    log("template_send", messageId, "error", { error: templateError });
  }

  // 5) Final state — completed if template sent OR we've exhausted retries
  const attempts = (row.attempts ?? 0) + 1;
  const fatal = extractError && /safety|blocked|400/i.test(extractError);
  if (templateSent && !internalError) {
    await supabase.from("whatsapp_messages").update({
      status: "completed",
      last_error: null,
      processed_at: new Date().toISOString(),
    }).eq("message_id", messageId);
    return;
  }
  if (attempts >= MAX_ATTEMPTS || fatal) {
    await supabase.from("whatsapp_messages").update({
      status: "failed",
      last_error: internalError || templateError || extractError || "max retries",
      processed_at: new Date().toISOString(),
    }).eq("message_id", messageId);
    return;
  }
  const delay = await backoffSeconds(attempts);
  await supabase.from("whatsapp_messages").update({
    status: "retry",
    last_error: internalError || templateError || extractError || null,
    next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(),
  }).eq("message_id", messageId);
}

async function pollAndProcess(supabase: ReturnType<typeof getServiceClient>) {
  // Backstop cron path. Picks up queued rows + retries whose next_attempt_at <= now().
  const { data: rows, error } = await supabase
    .from("whatsapp_messages")
    .select("message_id, status, next_attempt_at")
    .or(`status.eq.queued,status.eq.retry`)
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(WORKER_BATCH);
  if (error) {
    console.error("poll error", error.message);
    return;
  }
  for (const r of rows || []) {
    await processOne(supabase, r.message_id);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Optional shared-secret protection so Meta/webhook can't trigger worker by accident.
  if (WORKER_SECRET) {
    const got = req.headers.get("x-worker-secret") || "";
    if (got !== WORKER_SECRET) return new Response("forbidden", { status: 403 });
  }

  const supabase = getServiceClient();

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  if (body?.message_id) {
    await processOne(supabase, String(body.message_id));
  } else if (body?.poll === true) {
    await pollAndProcess(supabase);
  } else {
    // default = poll
    await pollAndProcess(supabase);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});