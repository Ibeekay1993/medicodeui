// whatsapp-worker/index.ts
//
// Advanced Ronsberger HMO WhatsApp AI Authorization Agent & Workflow Worker
//
// Triggered by:
//   - whatsapp-webhook (fan-out) for each new message
//   - cron job / manual call (backstop polling)
//

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const MEDAUTH_BASE_URL = Deno.env.get("MEDAUTH_INTERNAL_BASE_URL") || Deno.env.get("SUPABASE_URL") || "";
const MEDAUTH_INTERNAL_PATH = Deno.env.get("MEDAUTH_INTERNAL_PATH") || "/functions/v1/submit-authorization";
const MEDAUTH_API_KEY = Deno.env.get("MEDAUTH_INTERNAL_API_KEY") || "";
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const EVOLUTION_INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE_NAME") || "medicode-test";
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
  const safe = detail && typeof detail === "object"
    ? { ...(detail as Record<string, unknown>), body_preview: undefined }
    : detail;
  console.log(JSON.stringify({ stage, message_id, status, ...((safe as object) || {}) }));
  getServiceClient().from("whatsapp_processing_log").insert({
    message_id, stage, status, detail: detail ?? null,
  }).then(() => {});
}

async function backoffSeconds(attempt: number): Promise<number> {
  const base = Math.min(30 * Math.pow(2, Math.max(0, attempt - 1)), 8 * 60);
  const jitter = Math.floor(Math.random() * 15);
  return base + jitter;
}

// ── Deterministic Multi-Patient Block Splitter ─────────────────────────────
function splitPatientBlocks(text: string): string[] {
  if (!text || typeof text !== "string") return [text];

  // Find occurrences of strong patient boundary headers
  const headerRegex = /(?=(?:\*?\s*(?:Full\s*Name|Patient\s*Name|Name)\s*\*?\s*:))/gi;
  const parts = text.split(headerRegex).map(p => p.trim()).filter(Boolean);

  if (parts.length > 1) {
    return parts;
  }
  return [text];
}

// ── Pre-Gemini Patient Boundary Detector ──────────────────────────────────
// Detects explicit patient identity headers in raw text. Used to safely reset
// pending-data context when a clearly new patient is introduced.
const PATIENT_IDENTITY_REGEX = /(?:\*?\s*(?:Full\s*Name|Patient\s*Name|Name)\s*\*?\s*:\s*([^\n\r]+))/i;
const POLICY_IDENTITY_REGEX = /(?:\*?\s*(?:NHIA\s*(?:No|Number)?|NHIS\s*(?:No|Number)?|Policy\s*(?:No|Number)?|HMO\s*(?:No|Number)?)\s*\*?\s*:\s*([^\n\r]+))/i;

function extractPatientIdentityFromRaw(text: string): { patientName: string | null; policyNumber: string | null } {
  const pn = text.match(PATIENT_IDENTITY_REGEX);
  const pp = text.match(POLICY_IDENTITY_REGEX);
  return {
    patientName: pn?.[1]?.trim() || null,
    policyNumber: pp?.[1]?.trim() || null,
  };
}

// ── Deterministic Authorization Field Detector ───────────────────────────────
const AUTH_HEADER_PATTERNS = [
  /(?:^|\n)\s*(?:full\s*name|patient\s*name|name)\s*:\s*[^\n\r]+/i,
  /(?:^|\n)\s*(?:nhia\s*(?:no|number)?|nhis\s*(?:no|number)?|policy\s*(?:no|number)?)\s*:\s*[^\n\r]+/i,
  /(?:^|\n)\s*(?:diagnosis)\s*:\s*[^\n\r]+/i,
  /(?:^|\n)\s*(?:drugs?|treatment|procedures?|investigations?|services?|consultation)\s*:\s*[^\n\r]+/i,
];

function hasStrongAuthIndicators(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  let matchCount = 0;
  for (const pattern of AUTH_HEADER_PATTERNS) {
    if (pattern.test(text)) matchCount++;
  }
  return matchCount >= 2;
}

function extractAuthFieldsFromRaw(text: string): {
  patientName: string | null;
  policyNumber: string | null;
  diagnosis: string | null;
  treatment: string | null;
  procedure: string | null;
  investigation: string | null;
  requestedService: string | null;
  originatingHospital: string | null;
} {
  const result: Record<string, string | null> = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const nameMatch = trimmed.match(/^(?:\*?\s*(?:full\s*name|patient\s*name|name)\s*\*?\s*:\s*)(.+)$/i);
    if (nameMatch && !result.patientName) result.patientName = nameMatch[1].trim();
    const policyMatch = trimmed.match(/^(?:\*?\s*(?:nhia\s*(?:no|number)?|nhis\s*(?:no|number)?|policy\s*(?:no|number)?)\s*\*?\s*:\s*)(.+)$/i);
    if (policyMatch && !result.policyNumber) result.policyNumber = policyMatch[1].trim();
    const diagMatch = trimmed.match(/^(?:\*?\s*(?:diagnosis)\s*\*?\s*:\s*)(.+)$/i);
    if (diagMatch && !result.diagnosis) result.diagnosis = diagMatch[1].trim();
    const drugsMatch = trimmed.match(/^(?:\*?\s*(?:drugs?|treatment)\s*\*?\s*:\s*)(.+)$/i);
    if (drugsMatch && !result.treatment) result.treatment = drugsMatch[1].trim();
    const procMatch = trimmed.match(/^(?:\*?\s*(?:procedures?)\s*\*?\s*:\s*)(.+)$/i);
    if (procMatch && !result.procedure) result.procedure = procMatch[1].trim();
    const invMatch = trimmed.match(/^(?:\*?\s*(?:investigations?)\s*\*?\s*:\s*)(.+)$/i);
    if (invMatch && !result.investigation) result.investigation = invMatch[1].trim();
    const servMatch = trimmed.match(/^(?:\*?\s*(?:services?|consultation)\s*\*?\s*:\s*)(.+)$/i);
    if (servMatch && !result.requestedService) result.requestedService = servMatch[1].trim();
  }
  const lowerText = text.toLowerCase();
  if (lowerText.includes("university health service") || lowerText.includes("jaja")) {
    result.originatingHospital = "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)";
  }
  return result as any;
}

// ── Gemini Extraction & Intent Classifier ──────────────────────────────────
interface GeminiAnalysisResult {
  intent: string;
  patientName?: string | null;
  policyNumber?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  procedure?: string | null;
  investigation?: string | null;
  requestedService?: string | null;
  patientPhone?: string | null;
  originatingHospital?: string | null;
  referralHospital?: string | null;
  urgencyLevel: number;
  missingInfo: string[];
  isCancellationIntent: boolean;
  queryPatientName?: string | null;
  queryPolicyNumber?: string | null;
  conversationalReply?: string | null;
  raw?: unknown;
}

async function extractWithGemini(text: string): Promise<GeminiAnalysisResult> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

  const systemPrompt = `You are a medical authorization intake classifier & conversation assistant for Ronsberger HMO in Nigeria.
Analyze the incoming WhatsApp message from a hospital or patient and classify its intent and extract clinical entities.

INTENT CLASSIFICATION RULES:
- IMPORTANT PRIORITY RULE: If a message contains recognizable medical authorization information (e.g., patient name, policy/NHIS number, diagnosis, drugs/medications, procedures), it MUST ALWAYS be classified as NEW_AUTHORIZATION (or INCOMPLETE_AUTHORIZATION), NEVER as GREETING, GENERAL_CONVERSATION, or HELP, even if it begins with "Hi", "Hello", or conversational text.
- GREETING: Message is a simple greeting like "Hello", "Good morning", "Hi", "Good afternoon" WITHOUT medical authorization details.
- GENERAL_CONVERSATION: Thank you, okay, conversational response, or general non-authorization chatter.
- HELP: User asks how to submit authorizations or asks for assistance.
- NEW_AUTHORIZATION: Complete or partial request for a patient authorization (contains patient name, diagnosis, drugs/procedures, etc.).
- INCOMPLETE_AUTHORIZATION: Message attempts to start an authorization but is missing key information.
- CONTINUE_AUTHORIZATION: Follow-up message providing missing details for a patient request.
- AUTHORIZATION_STATUS: User asks for status of a request (e.g. "What is the status of Saul?", "Has Hannah been approved?", "Any update on my request?").
- APPROVAL_QUERY: Specific question asking if a patient request has been approved.
- REJECTION_QUERY: Specific question asking why a request was rejected.
- AUTHORIZATION_DETAILS: Asking what items/drugs were submitted for a patient.
- CANCELLATION: User explicitly asks to cancel, stop, or start over.
- NO_AUTHORIZATION: General statement or test message (like "LIVE TEST 001", random numbers) that is NOT a valid medical authorization.
- UNKNOWN: Cannot determine intent.

CONVERSATIONAL REPLY RULES (for conversationalReply field):
- Whenever the message is conversational chatter, small talk, a test message, an acknowledgment, a question about what the bot can do, or any non-authorization conversational exchange, classify intent as GENERAL_CONVERSATION and provide a natural, contextual response in conversationalReply.
- The conversationalReply must directly address what the sender said. Examples:
  * "I want to test how smart you are" → a friendly response acknowledging the test and briefly explaining what the bot can help with (submit authorizations, check status, request details, help).
  * "Is this all you can do?" → a friendly response explaining the bot can handle authorization submissions, status checks, request details, and related questions.
  * "Thanks", "Okay", "Got it" → a brief warm acknowledgment.
- conversationalReply MUST NOT be the generic authorization-submission template unless the sender is actually asking about how to submit an authorization.
- For greetings (GREETING), help requests (HELP), status queries (AUTHORIZATION_STATUS / APPROVAL_QUERY / REJECTION_QUERY / AUTHORIZATION_DETAILS), authorization requests (NEW_AUTHORIZATION / INCOMPLETE_AUTHORIZATION / CONTINUE_AUTHORIZATION), and cancellations (CANCELLATION), preserve the existing intent-specific behavior — conversationalReply may be left empty or null in those cases.
- Never invent patient names, NHIA/policy numbers, diagnoses, treatments, hospitals, or request references. If information is not present in the message, do not fabricate it.
- Keep conversationalReply concise (1–3 short sentences), professional, and polite. Do not include any signature like "— Ronsberger HMO" — that is added by the worker.

FIELD EXTRACTION RULES:
1. patientName: Patient's full name (from 'Full Name:', 'Patient Name:', 'Name:', etc.).
2. policyNumber: NHIA/NHIS/Policy number (from 'NHIA no:', 'NHIS No:', 'Policy:', etc.).
3. diagnosis: Medical diagnosis, clinical complaint, or impression.
4. treatment: Prescribed drugs, dosages, quantities (e.g. 'Tab Amlodipine 10mg').
5. procedure: Requested medical procedures or surgeries (e.g. 'Breast Scan', 'Appendectomy').
6. investigation: Requested laboratory or radiological tests (e.g. 'FBC', 'Chest X-ray').
7. requestedService: Summary of any requested clinical service if not broken down into treatment/procedure/investigation.
8. patientPhone: Patient or requester phone number if mentioned in body.
9. originatingHospital: Submitting hospital. ALIAS: If text mentions 'University health services', 'FROM UNIVERSITY HEALTH SERVICE', 'Jaja clinic', set originatingHospital to 'UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)'.
10. referralHospital: If referral mentioned (e.g. 'Referred to UCH'), set to 'UNIVERSITY COLLEGE HOSPITAL'.
11. urgencyLevel: 1=routine, 2=low, 3=standard, 4=urgent, 5=emergency.
12. isCancellationIntent: true if user says 'cancel', 'stop', 'start over'.
13. queryPatientName: Patient name if user is asking status about a specific patient (e.g. 'Saul' in 'Status of Saul?').
14. queryPolicyNumber: NHIA/policy number if user is querying status by number.
15. conversationalReply: Natural conversational response for GENERAL_CONVERSATION; empty string for other intents.

Return ONLY valid JSON matching the schema.`;

  const schema = {
    type: "object",
    properties: {
      intent: { type: "string" },
      patientName: { type: "string" },
      policyNumber: { type: "string" },
      diagnosis: { type: "string" },
      treatment: { type: "string" },
      procedure: { type: "string" },
      investigation: { type: "string" },
      requestedService: { type: "string" },
      patientPhone: { type: "string" },
      originatingHospital: { type: "string" },
      referralHospital: { type: "string" },
      urgencyLevel: { type: "integer" },
      missingInfo: { type: "array", items: { type: "string" } },
      isCancellationIntent: { type: "boolean" },
      queryPatientName: { type: "string" },
      queryPolicyNumber: { type: "string" },
      conversationalReply: { type: "string" },
    },
    required: ["intent", "urgencyLevel", "missingInfo", "isCancellationIntent"],
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
    throw new Error(`Gemini HTTP ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!part) throw new Error("Gemini: empty response");
  const parsed = JSON.parse(part);

  parsed.urgencyLevel = typeof parsed.urgencyLevel === "number" ? Math.max(1, Math.min(5, Math.round(parsed.urgencyLevel))) : 3;
  parsed.missingInfo = Array.isArray(parsed.missingInfo) ? parsed.missingInfo.slice(0, 10) : [];
  parsed.raw = data;

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

// ── Outbound WhatsApp Message Sender via Evolution API ───────────────────────
async function sendWhatsAppMessage(toPhone: string, text: string) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) throw new Error("Evolution creds missing");
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE_NAME)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: EVOLUTION_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ number: toPhone, text }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`Evolution send ${res.status}: ${t.slice(0, 200)}`);
  try { return JSON.parse(t); } catch { return { raw: t }; }
}

// ── Internal API post to submit-authorization with Direct DB Fallback ───────────
async function postAuthorization(
  supabase: ReturnType<typeof getServiceClient>,
  payload: Record<string, unknown>
): Promise<{ id: string; request_id?: string; status?: string }> {
  try {
    const url = `${MEDAUTH_BASE_URL.replace(/\/$/, "")}${MEDAUTH_INTERNAL_PATH}`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey || MEDAUTH_API_KEY}`,
      "apikey": serviceKey || MEDAUTH_API_KEY,
    };
    if (MEDAUTH_API_KEY) headers["x-api-key"] = MEDAUTH_API_KEY;
    if (WORKER_SECRET) headers["x-worker-secret"] = WORKER_SECRET;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const text = await res.text();
      const j = JSON.parse(text);
      if (j?.id) {
        return {
          id: String(j.id),
          request_id: j.request_id ? String(j.request_id) : undefined,
          status: j.status ? String(j.status) : undefined,
        };
      }
    }
  } catch (err) {
    console.warn("Internal submit-authorization HTTP invoke failed, falling back to direct DB insert:", (err as Error).message);
  }

  // Direct Database Insert Fallback (100% Guaranteed creation)
  const patientName = String(payload.patient_name || "").trim();
  const policyNumber = String(payload.policy_number || "").trim();
  const diagnosis = String(payload.diagnosis || "").trim();
  const treatment = String(payload.treatment || "").trim();
  const hospitalName = String(payload.hospital_name || "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)").trim();
  const phoneNumber = String(payload.phone_number || "").trim();
  const whatsappMessageId = String(payload.whatsapp_message_id || "");

  // Match hospital ID
  let hospitalId: string | null = null;
  const { data: hosp } = await supabase
    .from("hospitals")
    .select("id")
    .ilike("name", `%${hospitalName}%`)
    .limit(1)
    .maybeSingle();
  if (hosp?.id) hospitalId = hosp.id;

  const insertPayload = {
    patient_name: patientName,
    policy_number: policyNumber,
    diagnosis,
    treatment,
    patient_phone: phoneNumber,
    hospital_name: hospitalName,
    hospital_id: hospitalId,
    requesting_hospital_id: hospitalId,
    requesting_hospital_name: hospitalName,
    referring_hospital_id: hospitalId,
    referring_hospital_name: hospitalName,
    claiming_hospital_id: hospitalId,
    claiming_hospital_name: hospitalName,
    doctor_name: "WhatsApp automated intake",
    urgency: "routine",
    source: "whatsapp",
    clinical_notes: JSON.stringify({
      source: "whatsapp",
      whatsapp_message_id: whatsappMessageId,
      captured_at: new Date().toISOString(),
    }),
    whatsapp_raw_message: whatsappMessageId,
    status: "pending",
    submitted_by: null,
  };

  const { data: row, error: insErr } = await supabase
    .from("authorization_requests")
    .insert(insertPayload)
    .select("id, request_id, status")
    .single();

  if (insErr || !row) {
    throw new Error(`Direct DB fallback failed: ${insErr?.message || "unknown"}`);
  }

  return {
    id: row.id,
    request_id: row.request_id,
    status: row.status,
  };
}

// ── Context State Manager (whatsapp_conversations) ───────────────────────────
async function getOrCreateConversation(supabase: ReturnType<typeof getServiceClient>, phoneNumber: string) {
  const { data: existing } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("phone_number", phoneNumber)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("whatsapp_conversations")
    .insert({ phone_number: phoneNumber, pending_data: {} })
    .select("*")
    .single();

  if (error) {
    console.error("whatsapp_conversations insert error:", error.message);
    return { phone_number: phoneNumber, pending_data: {} };
  }
  return created;
}

async function updateConversationState(
  supabase: ReturnType<typeof getServiceClient>,
  phoneNumber: string,
  updates: Record<string, unknown>
) {
  await supabase
    .from("whatsapp_conversations")
    .update({ ...updates, updated_at: new Date().toISOString(), last_message_at: new Date().toISOString() })
    .eq("phone_number", phoneNumber);
}

// ── Main Processing for one message_id ───────────────────────────────────────
async function processOne(supabase: ReturnType<typeof getServiceClient>, messageId: string) {
  const { data: row, error: selErr } = await supabase
    .from("whatsapp_messages")
    .select("id, message_id, phone_number, message_type, message_body, attempts, status, raw_message")
    .eq("message_id", messageId)
    .maybeSingle();

  if (selErr || !row) {
    log("load", messageId, "error", { error: selErr?.message });
    return;
  }
  if (row.status === "completed") return;
  if (row.status === "processing") return;

  // Atomic claim: race-safe. We MUST verify a row was actually updated,
  // otherwise a concurrent worker can hold the row and we would still
  // proceed and produce duplicate outbound replies.
  const { data: claimData, error: claimErr } = await supabase
    .from("whatsapp_messages")
    .update({ status: "processing", attempts: (row.attempts ?? 0) + 1 })
    .eq("message_id", messageId)
    .in("status", ["queued", "retry"])
    .select("message_id");

  if (claimErr) {
    log("claim", messageId, "error", { error: claimErr.message });
    return;
  }
  if (!claimData || (Array.isArray(claimData) && claimData.length === 0)) {
    // Another worker already claimed this message in the meantime.
    log("claim", messageId, "skipped", { reason: "already_claimed_by_other" });
    return;
  }

  // Extra guard: skip any group or broadcast JIDs that slipped through the webhook filter
  const rawPhone = String(row.phone_number || "");
  if (rawPhone.endsWith("@g.us") || rawPhone.includes("status@broadcast") || rawPhone.includes("g.us")) {
    await supabase.from("whatsapp_messages").update({ status: "completed" }).eq("message_id", messageId);
    log("skip", messageId, "skipped", { reason: "group_or_broadcast" });
    return;
  }

  try {
    await processMessageBody(supabase, row);
  } catch (e) {
    log("process", messageId, "error", { error: (e as Error).message });
    // Reset to retry so the cron backstop can pick it up; do not leave stuck in "processing".
    await supabase.from("whatsapp_messages").update({
      status: "retry",
      next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
      last_error: (e as Error).message?.slice(0, 500) || "unknown",
    }).eq("message_id", messageId);
    return;
  }

  // Final worker state update
  await supabase.from("whatsapp_messages").update({
    status: "completed",
    last_error: null,
    processed_at: new Date().toISOString(),
    template_sent_at: new Date().toISOString(),
  }).eq("message_id", messageId);
}

async function processMessageBody(
  supabase: ReturnType<typeof getServiceClient>,
  row: { message_id: string; phone_number: string; message_type: string; message_body: string | null }
) {
  const messageId = row.message_id;
  const rawText = row.message_body || "";
  const blocks = splitPatientBlocks(rawText);

  // Load conversation session for sender
  const conversation = await getOrCreateConversation(supabase, row.phone_number);
  const pendingData: Record<string, string> = (conversation?.pending_data && typeof conversation.pending_data === "object")
    ? conversation.pending_data
    : {};

  let lastCreatedAuthId: string | null = null;
  let lastCreatedReqId: string | null = null;
  let finalReplyText: string | null = null;
  let replyPriority = 0; // 0: none, 1: general, 2: status, 3: authorization

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const blockText = blocks[blockIndex];

    // Step 1: Analyze block (Fast-path regex or Gemini)
    let analysis: GeminiAnalysisResult;
    try {
      const trimmed = blockText.trim();
      // Fast-path regex classifier for instant responses on simple chatter/greetings.
// Anchored to full line and require minimum 2 word characters to avoid matching
// single characters like "v" or "1" as acknowledgements.
const fastGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)\.?$/i;
const fastChatter = /^(thanks|thank you|thank you very much|ok|okay|noted|alright|received|got it|test|testing)(\s+[a-z].*)?\.?$/i;
const fastHelp = /^(help|info|how to use|support|assistance)\.?$/i;
const fastCancel = /^(cancel|cancel request|stop|start over|reset|nevermind)\.?$/i;

      if (fastCancel.test(trimmed)) {
        analysis = { intent: "CANCELLATION", urgencyLevel: 3, missingInfo: [], isCancellationIntent: true };
        log("fast_path", messageId, "ok", { intent: "CANCELLATION" });
      } else if (fastGreeting.test(trimmed)) {
        analysis = { intent: "GREETING", urgencyLevel: 3, missingInfo: [], isCancellationIntent: false };
        log("fast_path", messageId, "ok", { intent: "GREETING" });
      } else if (fastChatter.test(trimmed)) {
        analysis = { intent: "GENERAL_CONVERSATION", urgencyLevel: 3, missingInfo: [], isCancellationIntent: false };
        log("fast_path", messageId, "ok", { intent: "GENERAL_CONVERSATION" });
      } else if (fastHelp.test(trimmed)) {
        analysis = { intent: "HELP", urgencyLevel: 3, missingInfo: [], isCancellationIntent: false };
        log("fast_path", messageId, "ok", { intent: "HELP" });
      } else if (row.message_type === "text" && blockText) {
        analysis = await extractWithGemini(blockText);
        await supabase.from("whatsapp_messages").update({ extracted: analysis as any }).eq("message_id", messageId);
        log("gemini", messageId, "ok", { intent: analysis.intent, block: blockIndex + 1 });
      } else {
        analysis = {
          intent: "NON_TEXT_MESSAGE",
          urgencyLevel: 3,
          missingInfo: [],
          isCancellationIntent: false,
        };
        log("gemini", messageId, "skipped", { reason: `non-text:${row.message_type}` });
      }
    } catch (e) {
      log("gemini", messageId, "error", { error: (e as Error).message });
      analysis = {
        intent: "NO_AUTHORIZATION",
        urgencyLevel: 3,
        missingInfo: [],
        isCancellationIntent: false,
      };
    }

    let intent = (analysis.intent || "UNKNOWN").toUpperCase();
    const preOverrideIntent = intent;

    // ── STRONG AUTHORIZATION OVERRIDE ──────────────────────────────────────
    if (!["NEW_AUTHORIZATION", "INCOMPLETE_AUTHORIZATION", "CONTINUE_AUTHORIZATION", "CANCELLATION", "AUTHORIZATION_STATUS", "APPROVAL_QUERY", "REJECTION_QUERY", "AUTHORIZATION_DETAILS"].includes(intent)) {
      if (hasStrongAuthIndicators(blockText)) {
        analysis.intent = "NEW_AUTHORIZATION";
        const rawFields = extractAuthFieldsFromRaw(blockText);
        analysis.patientName = analysis.patientName || rawFields.patientName;
        analysis.policyNumber = analysis.policyNumber || rawFields.policyNumber;
        analysis.diagnosis = analysis.diagnosis || rawFields.diagnosis;
        analysis.treatment = analysis.treatment || rawFields.treatment;
        analysis.procedure = analysis.procedure || rawFields.procedure;
        analysis.investigation = analysis.investigation || rawFields.investigation;
        analysis.requestedService = analysis.requestedService || rawFields.requestedService;
        analysis.originatingHospital = analysis.originatingHospital || rawFields.originatingHospital;
        intent = "NEW_AUTHORIZATION";
        log("auth_override", messageId, "ok", { reason: "strong_indicators", original_intent: preOverrideIntent });
      }
    }

    // ── 1. CANCELLATION / START OVER ─────────────────────────────────────────
    if (analysis.isCancellationIntent || intent === "CANCELLATION") {
      await updateConversationState(supabase, row.phone_number, { pending_data: {}, active_intent: "CANCELLATION" });
      const reply = "Your pending authorization draft has been cancelled. How else can I assist you? — Ronsberger HMO";
      if (replyPriority < 0) { // Cancellation is immediate reset, but we can use a priority or just send it.
        finalReplyText = reply;
        replyPriority = 0;
      }
      // Since cancellation is a hard reset, we might want to send it immediately or just set finalReplyText.
      // To be safe and follow the "one response" rule:
      finalReplyText = reply;
      replyPriority = 4; // Highest priority for cancellation
      continue;
    }

    // ── 2. NON-AUTHORIZATION INTENTS ─────────────────────────────────────────
    // RULE: Greetings, general talk, help MUST NEVER create authorization DB rows!
    // RULE: Greetings do NOT clear pending state!
    if (["GREETING", "GENERAL_CONVERSATION", "HELP", "NO_AUTHORIZATION", "UNKNOWN", "NON_TEXT_MESSAGE"].includes(intent)) {
      let replyText = "";
      if (intent === "GREETING") {
        replyText = "Hello! Welcome to Ronsberger HMO Medical Authorization Portal.\n\nHow can I assist you today? You can submit a patient authorization request or check request status anytime.";
      } else if (intent === "HELP") {
        replyText = "Welcome to Ronsberger HMO Authorization Assistant.\n\n• To submit an authorization: Send patient details (Name, NHIA/Policy No, Diagnosis, Treatment/Procedures, Hospital).\n• To check status: Ask 'What is the status of [Patient Name]?'\n\n— Ronsberger HMO";
      } else if (intent === "NON_TEXT_MESSAGE") {
        replyText = "I can currently process medical authorization details sent as text. Please send the patient information as a text message.\n\n— Ronsberger HMO";
      } else if (intent === "GENERAL_CONVERSATION" && analysis.conversationalReply && analysis.conversationalReply.trim()) {
        // Use Gemini's contextual reply when available (e.g. "I want to test how smart you are")
        replyText = `${analysis.conversationalReply.trim()}\n\n— Ronsberger HMO`;
      } else {
        replyText = "Thank you for contacting Ronsberger HMO.\n\nIf you need to submit a patient authorization or check the status of a request, please provide the details here.\n\n— Ronsberger HMO";
      }
      if (replyPriority < 1) {
        finalReplyText = replyText;
        replyPriority = 1;
      }
      continue;
    }

    // ── 3. STATUS & ENQUIRY INTENTS ──────────────────────────────────────────
    if (["AUTHORIZATION_STATUS", "APPROVAL_QUERY", "REJECTION_QUERY", "AUTHORIZATION_DETAILS"].includes(intent)) {
      const queryName = analysis.queryPatientName || analysis.patientName || null;
      const queryPolicy = analysis.queryPolicyNumber || analysis.policyNumber || null;

      let matchedRequest: any = null;
      let ambiguousReply: string | null = null;

      if (queryName || queryPolicy) {
        // Search DB by explicit patient name or policy, but ALWAYS scope to
        // requests originating from this WhatsApp sender to prevent
        // cross-hospital contamination.
        const { data: linkedMessages } = await supabase
          .from("whatsapp_messages")
          .select("authorization_request_id")
          .eq("phone_number", row.phone_number)
          .not("authorization_request_id", "is", null);

        const senderRequestIds = (linkedMessages || [])
          .map(m => m.authorization_request_id)
          .filter(Boolean) as string[];

        let query = supabase
          .from("authorization_requests")
          .select("id, request_id, patient_name, policy_number, status, decision_reason, diagnosis, treatment, hospital_name, created_at")
          .order("created_at", { ascending: false });

        if (queryPolicy) {
          query = query.ilike("policy_number", `%${queryPolicy}%`);
        } else if (queryName) {
          query = query.ilike("patient_name", `%${queryName}%`);
        }

        if (senderRequestIds.length > 0) {
          query = query.in("id", senderRequestIds);
        } else {
          // No sender-linked requests — we must NOT leak authorizations from
          // other hospitals, so return empty result.
          query = query.in("id", ["00000000-0000-0000-0000-000000000000"]);
        }

        const { data: reqs } = await query.limit(5);
        if (reqs && reqs.length === 1) {
          matchedRequest = reqs[0];
        } else if (reqs && reqs.length > 1) {
          // Multiple candidates even after sender-scope → ask for clarification
          const patientList = reqs.map(r => `• ${r.patient_name} (${r.request_id}) — ${(r.status || "pending").toUpperCase()}`).join("\n");
          ambiguousReply = `I found more than one recent authorization request from this number. Please provide the patient's name or NHIA/NHIS number so I can check the correct request.\n\n${patientList}\n\n— Ronsberger HMO`;
        }
      } else {
        // No explicit patient in query — check sender phone requests
        const { data: linkedMessages } = await supabase
          .from("whatsapp_messages")
          .select("authorization_request_id")
          .eq("phone_number", row.phone_number)
          .not("authorization_request_id", "is", null);

        const requestIds = (linkedMessages || [])
          .map(m => m.authorization_request_id)
          .filter(Boolean) as string[];

        if (requestIds.length === 0) {
          matchedRequest = null;
        } else {
          const { data: senderReqs } = await supabase
            .from("authorization_requests")
            .select("id, request_id, patient_name, policy_number, status, decision_reason, diagnosis, treatment, hospital_name, created_at")
            .in("id", requestIds)
            .order("created_at", { ascending: false })
            .limit(5);

          if (senderReqs && senderReqs.length === 1) {
            matchedRequest = senderReqs[0];
          } else if (senderReqs && senderReqs.length > 1) {
            const patientList = senderReqs.map(r => `• ${r.patient_name} (${r.request_id}) — ${(r.status || "pending").toUpperCase()}`).join("\n");
            ambiguousReply = `I found more than one recent authorization request from this number. Please provide the patient's name or NHIA/NHIS number so I can check the correct request.\n\n${patientList}\n\n— Ronsberger HMO`;
          }
        }
      }

      // Handle ambiguous result first
      if (ambiguousReply) {
        if (replyPriority < 2) {
          finalReplyText = ambiguousReply;
          replyPriority = 2;
        }
        continue;
      }

      // No match at all
      if (!matchedRequest) {
        const notFound = `I could not find an authorization request matching that detail from this WhatsApp number. If you believe this is an error, please share the patient name or NHIA/NHIS number.\n\n— Ronsberger HMO`;
        if (replyPriority < 2) {
          finalReplyText = notFound;
          replyPriority = 2;
        }
        continue;
      }

      // Single deterministic match — link the message for auditability and reply
      await supabase
        .from("whatsapp_messages")
        .update({ authorization_request_id: matchedRequest.id })
        .eq("message_id", messageId);

      const ref = matchedRequest.request_id || matchedRequest.id.slice(0, 8);
      const st = (matchedRequest.status || "pending").toLowerCase();
      let reply = "";

      if (intent === "AUTHORIZATION_DETAILS") {
        reply = `Authorization Details\n\nPatient: ${matchedRequest.patient_name}\nNHIA/NHIS: ${matchedRequest.policy_number}\nDiagnosis: ${matchedRequest.diagnosis || "Not specified"}\nTreatment/Services: ${matchedRequest.treatment || "Not specified"}\nHospital: ${matchedRequest.hospital_name || "Not specified"}\nStatus: ${st.toUpperCase()}\n\n— Ronsberger HMO`;
      } else if (st === "approved") {
        reply = `Authorization Update\n\n${matchedRequest.patient_name}'s medical authorization request (Ref: ${ref}) has been APPROVED.\n\nYou may proceed according to the approved details.\n\n— Ronsberger HMO`;
      } else if (st === "rejected") {
        const reason = matchedRequest.decision_reason || "Does not meet clinical policy guidelines";
        reply = `Authorization Update\n\n${matchedRequest.patient_name}'s medical authorization request (Ref: ${ref}) was NOT APPROVED.\n\nReason:\n${reason}\n\nIf you need clarification, please reply to this message.\n\n— Ronsberger HMO`;
      } else {
        // pending or any other interim state
        reply = `Authorization Update\n\n${matchedRequest.patient_name}'s medical authorization request (Ref: ${ref}) is currently ${st.toUpperCase()}.\n\nWe will notify you once a final decision is available.\n\n— Ronsberger HMO`;
      }

      if (replyPriority < 2) {
        finalReplyText = reply;
        replyPriority = 2;
      }
      continue;
    }

    // ── 4. AUTHORIZATION INTAKE INTENTS ──────────────────────────────────────
    if (["NEW_AUTHORIZATION", "INCOMPLETE_AUTHORIZATION", "CONTINUE_AUTHORIZATION"].includes(intent)) {
      // ── NEW PATIENT BOUNDARY RULE ─────────────────────────────────────────────
      // Detect explicit patient identity directly from raw text (independent of
      // Gemini extraction). If a different identity is detected versus the
      // pending patient, reset context so we do NOT carry John's diagnosis/
      // treatment/policy/hospital into Jane's request.
      const rawIdentity = extractPatientIdentityFromRaw(blockText);
      const newPatientName = analysis.patientName || rawIdentity.patientName;
      const newPolicyNumber = analysis.policyNumber || rawIdentity.policyNumber;

      let currentPending: Record<string, string> = { ...pendingData };
      const pendingName = (currentPending.patientName || "").toLowerCase().trim();
      const pendingPolicy = (currentPending.policyNumber || "").toLowerCase().trim();
      const candidateName = (newPatientName || "").toLowerCase().trim();
      const candidatePolicy = (newPolicyNumber || "").toLowerCase().trim();

      const hasPending = !!pendingName || !!pendingPolicy;
      const hasCandidate = !!candidateName || !!candidatePolicy;
      const sameName = candidateName && pendingName && candidateName === pendingName;
      const samePolicy = candidatePolicy && pendingPolicy && candidatePolicy === pendingPolicy;

      if (hasPending && hasCandidate && !sameName && !samePolicy) {
        // Clearly different patient identity. Reset.
        currentPending = {};
      }

      // Merge pending context with newly extracted fields
      const effectivePatientName = newPatientName || currentPending.patientName || null;
      const effectivePolicyNumber = newPolicyNumber || currentPending.policyNumber || null;
      const effectiveDiagnosis = analysis.diagnosis || currentPending.diagnosis || null;
      const effectiveTreatment = analysis.treatment || currentPending.treatment || null;
      const effectiveProcedure = analysis.procedure || currentPending.procedure || null;
      const effectiveInvestigation = analysis.investigation || currentPending.investigation || null;
      const effectiveService = analysis.requestedService || currentPending.requestedService || null;
      const effectiveHospital = analysis.originatingHospital || currentPending.originatingHospital || "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)";
      const effectiveReferral = analysis.referralHospital || currentPending.referralHospital || null;

      // Combined requested service check (treatment, procedure, investigation, or service)
      const primaryService = effectiveTreatment || effectiveProcedure || effectiveInvestigation || effectiveService || null;

      // Strict Validation:
      // Identity/Context requires: Patient Name, Policy/NHIA Number, Diagnosis, Hospital
      // Requested Service requires: At least one of treatment/procedure/investigation/service
      const missingFields: string[] = [];
      if (!effectivePatientName) missingFields.push("Patient Name");
      if (!effectivePolicyNumber) missingFields.push("NHIA / Policy Number");
      if (!effectiveDiagnosis) missingFields.push("Diagnosis / Clinical Complaint");
      if (!primaryService) missingFields.push("Requested Treatment, Procedure, or Service");

      if (missingFields.length > 0) {
        // Save what we have into pending_data
        const newPending = {
          patientName: effectivePatientName,
          policyNumber: effectivePolicyNumber,
          diagnosis: effectiveDiagnosis,
          treatment: effectiveTreatment,
          procedure: effectiveProcedure,
          investigation: effectiveInvestigation,
          requestedService: effectiveService,
          originatingHospital: effectiveHospital,
          referralHospital: effectiveReferral,
        };
        await updateConversationState(supabase, row.phone_number, {
          pending_data: newPending,
          active_intent: "INCOMPLETE_AUTHORIZATION",
        });

        const missingList = missingFields.map(m => `• ${m}`).join("\n");
        const patientLabel = effectivePatientName ? ` for ${effectivePatientName}` : "";
        const missingReply = `I have started your authorization request${patientLabel}, but I still need:\n\n${missingList}\n\nPlease reply with the missing details to complete the request.\n\n— Ronsberger HMO`;
        if (replyPriority < 3) {
          finalReplyText = missingReply;
          replyPriority = 3;
        }
        continue;
      }

      // ── COMPLETE AUTHORIZATION REQUEST ────────────────────────────────────
      // 1. Duplicate Protection Check (within last 24h, scoped to this sender
      //    via whatsapp_messages linkage to prevent cross-hospital collisions).
      const { data: linkedForDup } = await supabase
        .from("whatsapp_messages")
        .select("authorization_request_id")
        .eq("phone_number", row.phone_number)
        .not("authorization_request_id", "is", null);

      const senderAuthIds = (linkedForDup || [])
        .map(m => m.authorization_request_id)
        .filter(Boolean) as string[];

      let recentDuplicates: any[] | null = null;
      if (senderAuthIds.length > 0) {
        const { data } = await supabase
          .from("authorization_requests")
          .select("id, request_id, status, created_at")
          .in("id", senderAuthIds)
          .ilike("patient_name", effectivePatientName!)
          .ilike("policy_number", effectivePolicyNumber!)
          .ilike("diagnosis", `%${effectiveDiagnosis || ""}%`)
          .ilike("treatment", `%${primaryService || ""}%`)
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);
        recentDuplicates = data;
      }

      if (recentDuplicates && recentDuplicates.length > 0) {
        const dup = recentDuplicates[0];
        const dupRef = dup.request_id || dup.id.slice(0, 8);
        const dupReply = `It looks like an authorization request for ${effectivePatientName} was recently submitted from this number (Ref: ${dupRef}). It is currently ${(dup.status || "pending").toUpperCase()}.\n\nIf this is a new request for the same patient, please reply with the updated clinical details.\n\n— Ronsberger HMO`;
        if (replyPriority < 3) {
          finalReplyText = dupReply;
          replyPriority = 3;
        }
        await updateConversationState(supabase, row.phone_number, { pending_data: {} });
        continue;
      }

      // 2. Submit Authorization
      try {
        const payload = {
          source: "whatsapp",
          whatsapp_message_id: messageId,
          patient_name: effectivePatientName,
          policy_number: effectivePolicyNumber,
          diagnosis: effectiveDiagnosis,
          treatment: primaryService,
          phone_number: analysis.patientPhone || row.phone_number,
          hospital_name: effectiveHospital,
          referral_hospital_name: effectiveReferral,
          urgency_level: analysis.urgencyLevel ?? 3,
          missing_info: [],
          raw_message: blockText,
        };

        const result = await postAuthorization(supabase, payload);
        lastCreatedAuthId = result.id;
        lastCreatedReqId = result.request_id || result.id.slice(0, 8);

        // Mandatory Linkage in whatsapp_messages table
        await supabase
          .from("whatsapp_messages")
          .update({
            authorization_request_id: result.id,
            internal_request_id: result.id,
          })
          .eq("message_id", messageId);

        // Update persistent conversation state
        await updateConversationState(supabase, row.phone_number, {
          pending_data: {},
          active_intent: "COMPLETED",
          last_patient_name: effectivePatientName,
          last_policy_number: effectivePolicyNumber,
          active_authorization_id: result.id,
        });

        // Send Acknowledgment with patient name (Reference omitted per user preference)
        const ack = `Your medical authorization request for ${effectivePatientName} has been received successfully.\n\nOur team will review it and update you here once a decision is available.\n\n— Ronsberger HMO`;
        if (replyPriority < 3) {
          finalReplyText = ack;
          replyPriority = 3;
        }
        log("internal_api", messageId, "ok", { id: result.id, request_id: result.request_id });
      } catch (e) {
        log("internal_api", messageId, "error", { error: (e as Error).message });
        throw e;
      }
    }
  }

  if (finalReplyText) {
    await sendWhatsAppMessage(row.phone_number, finalReplyText);
  }
}

async function processNotifications(supabase: ReturnType<typeof getServiceClient>) {
  const { data: notifications, error } = await supabase
    .from("whatsapp_notifications")
    .select("*")
    .in("status", ["pending", "retry"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(WORKER_BATCH);

  if (error) {
    console.error("notification poll error", error.message);
    return;
  }

  for (const note of notifications || []) {
    try {
      // Get the ORIGINAL WhatsApp sender (earliest message linked to this request)
      const { data: msgs } = await supabase
        .from("whatsapp_messages")
        .select("phone_number")
        .eq("authorization_request_id", note.authorization_request_id)
        .order("received_at", { ascending: true })
        .limit(1);

      const recipient = msgs?.[0]?.phone_number || note.phone_number;
      if (!recipient) {
        await supabase.from("whatsapp_notifications").update({ status: "failed", last_error: "No recipient found" }).eq("id", note.id);
        continue;
      }

      const { data: authReq } = await supabase
        .from("authorization_requests")
        .select("patient_name, status, decision_reason")
        .eq("id", note.authorization_request_id)
        .single();

      if (!authReq) {
        await supabase.from("whatsapp_notifications").update({ status: "failed", last_error: "Auth request not found" }).eq("id", note.id);
        continue;
      }

      let body = "";
      if (note.notification_type === "APPROVAL") {
        body = `Authorization Update\n\n${authReq.patient_name}'s medical authorization request has been approved.\n\n— Ronsberger HMO`;
      } else if (note.notification_type === "REJECTION") {
        body = `Authorization Update\n\n${authReq.patient_name}'s medical authorization request has not been approved.\n\nReason: ${authReq.decision_reason || "Does not meet clinical policy guidelines"}\n\nIf you need clarification or would like to provide additional information, please reply to this message.\n\n— Ronsberger HMO`;
      } else {
        await supabase.from("whatsapp_notifications").update({ status: "failed", last_error: "Unknown type" }).eq("id", note.id);
        continue;
      }

      await sendWhatsAppMessage(recipient, body);
      await supabase.from("whatsapp_notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", note.id);
    } catch (e) {
      await supabase.from("whatsapp_notifications").update({
        status: "retry",
        attempts: (note.attempts || 0) + 1,
        last_error: (e as Error).message
      }).eq("id", note.id);
    }
  }
}

async function pollAndProcess(supabase: ReturnType<typeof getServiceClient>) {
  const now = new Date().toISOString();
  // Pick up:
  //   1. Newly queued messages where next_attempt_at IS NULL (just arrived)
  //   2. Retry messages where next_attempt_at <= now (ready for another attempt)
  const { data: rows, error } = await supabase
    .from("whatsapp_messages")
    .select("message_id, status, next_attempt_at")
    .or(`status.eq.queued,status.eq.retry`)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("received_at", { ascending: true })
    .limit(WORKER_BATCH);

  if (error) {
    console.error("poll error", error.message);
    return;
  }

  // Also process proactive notifications
  await processNotifications(supabase);

  for (const r of rows || []) {
    await processOne(supabase, r.message_id);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const isServiceRole = !!serviceKey && bearer === serviceKey;
  const gotWorkerSecret = req.headers.get("x-worker-secret") || "";

  if (!isServiceRole) {
    if (WORKER_SECRET) {
      if (gotWorkerSecret !== WORKER_SECRET) return new Response("forbidden", { status: 403 });
    } else {
      return new Response("forbidden", { status: 403 });
    }
  }

  const supabase = getServiceClient();

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  if (body?.message_id) {
    await processOne(supabase, String(body.message_id));
  } else if (body?.poll === true) {
    await pollAndProcess(supabase);
  } else {
    await pollAndProcess(supabase);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});