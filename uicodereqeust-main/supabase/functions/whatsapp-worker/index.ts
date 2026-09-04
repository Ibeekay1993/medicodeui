// whatsapp-worker/index.ts
// Ronsberger HMO WhatsApp AI conversation worker.
// AI interprets intent and entities; deterministic code owns database/business actions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
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
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

function log(stage: string, message_id: string, status: "ok" | "error" | "skipped", detail?: unknown) {
  console.log(JSON.stringify({ stage, message_id, status, ...(detail && typeof detail === "object" ? detail : {}) }));
  getServiceClient().from("whatsapp_processing_log").insert({ message_id, stage, status, detail: detail ?? null }).then(() => {});
}

function splitPatientBlocks(text: string): string[] {
  if (!text) return [text];
  const parts = text.split(/(?=(?:\*?\s*(?:Full\s*Name|Patient\s*Name|Name)\s*\*?\s*:))/gi).map(x => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [text];
}

function extractAuthFieldsFromRaw(text: string) {
  const result: Record<string, string | null> = {
    patientName: null, policyNumber: null, diagnosis: null, treatment: null,
    procedure: null, investigation: null, requestedService: null, originatingHospital: null,
  };
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const patterns: [string, RegExp][] = [
      ["patientName", /^(?:\*?\s*(?:full\s*name|patient\s*name|name)\s*\*?\s*:\s*)(.+)$/i],
      ["policyNumber", /^(?:\*?\s*(?:nhia\s*(?:no|number)?|nhis\s*(?:no|number)?|policy\s*(?:no|number)?)\s*\*?\s*:\s*)(.+)$/i],
      ["diagnosis", /^(?:\*?\s*diagnosis\s*\*?\s*:\s*)(.+)$/i],
      ["treatment", /^(?:\*?\s*(?:drugs?|treatment)\s*\*?\s*:\s*)(.+)$/i],
      ["procedure", /^(?:\*?\s*procedures?\s*\*?\s*:\s*)(.+)$/i],
      ["investigation", /^(?:\*?\s*investigations?\s*\*?\s*:\s*)(.+)$/i],
      ["requestedService", /^(?:\*?\s*(?:services?|consultation)\s*\*?\s*:\s*)(.+)$/i],
    ];
    for (const [key, pattern] of patterns) {
      const m = t.match(pattern);
      if (m && !result[key]) result[key] = m[1].trim();
    }
  }
  const lower = text.toLowerCase();
  if (lower.includes("university health service") || lower.includes("jaja")) result.originatingHospital = "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)";
  return result;
}

const AUTH_HEADER_PATTERNS = [
  /(?:^|\n)\s*(?:full\s*name|patient\s*name|name)\s*:\s*[^\n\r]+/i,
  /(?:^|\n)\s*(?:nhia\s*(?:no|number)?|nhis\s*(?:no|number)?|policy\s*(?:no|number)?)\s*:\s*[^\n\r]+/i,
  /(?:^|\n)\s*diagnosis\s*:\s*[^\n\r]+/i,
  /(?:^|\n)\s*(?:drugs?|treatment|procedures?|investigations?|services?|consultation)\s*:\s*[^\n\r]+/i,
];
function hasStrongAuthIndicators(text: string) {
  return AUTH_HEADER_PATTERNS.filter(p => p.test(text)).length >= 2;
}

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

async function extractWithGemini(text: string, context = ""): Promise<GeminiAnalysisResult> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
  const systemPrompt = `You are the conversation intelligence layer for Ronsberger HMO Nigeria. Understand the CURRENT WhatsApp message in context, but the current message always has priority over older messages.

Return JSON only. Classify exactly one intent:
GREETING, GENERAL_CONVERSATION, HELP, NEW_AUTHORIZATION, INCOMPLETE_AUTHORIZATION, CONTINUE_AUTHORIZATION, AUTHORIZATION_STATUS, APPROVAL_QUERY, REJECTION_QUERY, AUTHORIZATION_DETAILS, CANCELLATION, PROVIDER_QUERY, NO_AUTHORIZATION, UNKNOWN.

Rules:
- A message containing structured authorization information is authorization, even if it begins with Hello/Hi.
- A status/update/approval/rejection question is an enquiry, even when a previous message was an authorization draft.
- If the user changes subject, switch task. Never force the new message into the previous task.
- Natural status wording includes: "what is the status for X", "any update on X", "where is X's request", "has X been approved", "is X still pending", "what happened to my request".
- If a status query has no patient name/number, use the most recent active patient only when unambiguous.
- Provider queries include requests for a hospital, clinic, doctor, specialist, facility or healthcare provider.
- CONTINUE_AUTHORIZATION means the user is supplying information for an unfinished authorization.
- Do not invent names, policy numbers, diagnoses, treatments or request references.
- conversationalReply is only for GENERAL_CONVERSATION and should directly answer the user's message in 1-3 short sentences.

Extract: patientName, policyNumber, diagnosis, treatment, procedure, investigation, requestedService, patientPhone, originatingHospital, referralHospital, queryPatientName, queryPolicyNumber, urgencyLevel, missingInfo, isCancellationIntent, conversationalReply.`;
  const schema = {
    type: "object",
    properties: {
      intent: { type: "string" }, patientName: { type: "string" }, policyNumber: { type: "string" },
      diagnosis: { type: "string" }, treatment: { type: "string" }, procedure: { type: "string" },
      investigation: { type: "string" }, requestedService: { type: "string" }, patientPhone: { type: "string" },
      originatingHospital: { type: "string" }, referralHospital: { type: "string" }, urgencyLevel: { type: "integer" },
      missingInfo: { type: "array", items: { type: "string" } }, isCancellationIntent: { type: "boolean" },
      queryPatientName: { type: "string" }, queryPolicyNumber: { type: "string" }, conversationalReply: { type: "string" },
    },
    required: ["intent", "urgencyLevel", "missingInfo", "isCancellationIntent"],
  } as const;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: context ? `${context}\n\nCURRENT MESSAGE:\n${text}` : text }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!part) throw new Error("Gemini: empty response");
  const parsed = JSON.parse(part) as GeminiAnalysisResult;
  parsed.urgencyLevel = typeof parsed.urgencyLevel === "number" ? Math.max(1, Math.min(5, Math.round(parsed.urgencyLevel))) : 3;
  parsed.missingInfo = Array.isArray(parsed.missingInfo) ? parsed.missingInfo.slice(0, 10) : [];
  parsed.raw = data;
  const lower = text.toLowerCase();
  if (lower.includes("university health service") || lower.includes("jaja")) parsed.originatingHospital = "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)";
  return parsed;
}

function extractQueryPatientName(text: string): string | null {
  const patterns = [
    /\b(?:status|update|approval|approved|rejected|rejection|details?)\s+(?:for|of)\s+([A-Za-z][A-Za-z .'-]{1,80}?)(?:\?|$|\.|\s+(?:please|now|yet|today)\b)/i,
    /\b(?:has|is)\s+([A-Za-z][A-Za-z .'-]{1,80}?)\s+(?:been\s+)?(?:approved|rejected|processed)\b/i,
    /\b(?:what happened to|where is)\s+([A-Za-z][A-Za-z .'-]{1,80}?)(?:\?|$|\.)/i,
  ];
  for (const p of patterns) { const m = text.match(p); if (m?.[1]) return m[1].trim().replace(/[.,!?]+$/, ""); }
  return null;
}

function brainGuard(text: string, analysis: GeminiAnalysisResult, conversation: any): GeminiAnalysisResult {
  const t = text.trim();
  const out = { ...analysis };
  const hasStatusWord = /\b(status|update|approval|approved|rejected|rejection|declined|pending|decision|progress)\b/i.test(t);
  const hasStatusForm = /\b(?:status|update|approval|approved|rejected|rejection|pending)\s+(?:for|of)\b/i.test(t) || /\b(?:what|where|any|has|is|need|want|check|tell)\b.*\b(?:status|update|approved|approval|rejected|rejection|pending|decision)\b/i.test(t);
  const explicitStatus = hasStatusForm || (hasStatusWord && /\b(?:request|authorization|case|patient|him|her|it|this|my)\b/i.test(t));
  const provider = /\b(?:health\s*care\s+provider|health\s+provider|provider|hospital|clinic|doctor|specialist|facility)\b/i.test(t) && /\b(?:need|want|looking|find|ask|recommend|which|where|nearest|available|help)\b/i.test(t);
  const auth = hasStrongAuthIndicators(t) || (/\b(?:submit|request|authorization|pre[- ]?authorization)\b/i.test(t) && /\b(?:patient|diagnosis|treatment|drug|procedure|investigation|service|nhia|nhis|policy)\b/i.test(t));

  if (explicitStatus && !auth) {
    out.intent = /\b(?:rejected|rejection|declined|why\s+was)\b/i.test(t) ? "REJECTION_QUERY" : /\b(?:approved|approval)\b/i.test(t) ? "APPROVAL_QUERY" : "AUTHORIZATION_STATUS";
    out.queryPatientName = extractQueryPatientName(t) || out.queryPatientName || out.patientName || conversation?.last_patient_name || null;
    out.queryPolicyNumber = out.queryPolicyNumber || out.policyNumber || conversation?.last_policy_number || null;
    out.missingInfo = [];
    return out;
  }
  if (provider && !auth && !explicitStatus) { out.intent = "PROVIDER_QUERY"; out.missingInfo = []; return out; }
  if (auth && !explicitStatus) {
    out.intent = hasStrongAuthIndicators(t) ? "NEW_AUTHORIZATION" : (out.intent || "INCOMPLETE_AUTHORIZATION");
    const raw = extractAuthFieldsFromRaw(t);
    out.patientName = out.patientName || raw.patientName; out.policyNumber = out.policyNumber || raw.policyNumber;
    out.diagnosis = out.diagnosis || raw.diagnosis; out.treatment = out.treatment || raw.treatment;
    out.procedure = out.procedure || raw.procedure; out.investigation = out.investigation || raw.investigation;
    out.requestedService = out.requestedService || raw.requestedService; out.originatingHospital = out.originatingHospital || raw.originatingHospital;
  }
  if (["UNKNOWN", "NO_AUTHORIZATION", "GENERAL_CONVERSATION"].includes(out.intent) && conversation?.active_intent === "INCOMPLETE_AUTHORIZATION" &&
      /\b(?:name|patient|nhia|nhis|policy|diagnosis|treatment|drug|procedure|investigation|service)\b/i.test(t)) {
    out.intent = "CONTINUE_AUTHORIZATION";
  }
  return out;
}

function buildContext(conversation: any, history: any[]) {
  const pending = conversation?.pending_data && typeof conversation.pending_data === "object" ? JSON.stringify(conversation.pending_data) : "{}";
  const recent = (history || []).slice(-8).map((m: any) => `inbound: ${String(m.message_body || "").slice(0, 1000)}`).join("\n");
  return [
    "CONVERSATION STATE (current message overrides stale context):",
    `active_intent=${conversation?.active_intent || "none"}`,
    `last_patient_name=${conversation?.last_patient_name || "none"}`,
    `last_policy_number=${conversation?.last_policy_number || "none"}`,
    `pending_data=${pending}`,
    "RECENT MESSAGES:", recent || "none",
  ].join("\n");
}

async function sendWhatsAppMessage(toPhone: string, text: string) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) throw new Error("Evolution creds missing");
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE_NAME)}`;
  const res = await fetch(url, { method: "POST", headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ number: toPhone, text }) });
  const body = await res.text();
  if (!res.ok) throw new Error(`Evolution send ${res.status}: ${body.slice(0, 200)}`);
  return body;
}

async function postAuthorization(supabase: ReturnType<typeof getServiceClient>, payload: Record<string, unknown>) {
  try {
    const url = `${MEDAUTH_BASE_URL.replace(/\/$/, "")}${MEDAUTH_INTERNAL_PATH}`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey || MEDAUTH_API_KEY}`, apikey: serviceKey || MEDAUTH_API_KEY };
    if (MEDAUTH_API_KEY) headers["x-api-key"] = MEDAUTH_API_KEY;
    if (WORKER_SECRET) headers["x-worker-secret"] = WORKER_SECRET;
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    if (res.ok) { const j = await res.json(); if (j?.id) return { id: String(j.id), request_id: j.request_id ? String(j.request_id) : undefined, status: j.status ? String(j.status) : undefined }; }
  } catch (e) { console.warn("submit-authorization invoke failed; using DB fallback", (e as Error).message); }

  const patientName = String(payload.patient_name || "").trim();
  const policyNumber = String(payload.policy_number || "").trim();
  const diagnosis = String(payload.diagnosis || "").trim();
  const treatment = String(payload.treatment || "").trim();
  const hospitalName = String(payload.hospital_name || "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)").trim();
  const phoneNumber = String(payload.phone_number || "").trim();
  const whatsappMessageId = String(payload.whatsapp_message_id || "");
  let hospitalId: string | null = null;
  const { data: hosp } = await supabase.from("hospitals").select("id").ilike("name", `%${hospitalName}%`).limit(1).maybeSingle();
  if (hosp?.id) hospitalId = hosp.id;
  const { data: row, error } = await supabase.from("authorization_requests").insert({
    patient_name: patientName, policy_number: policyNumber, diagnosis, treatment, patient_phone: phoneNumber,
    hospital_name: hospitalName, hospital_id: hospitalId, requesting_hospital_id: hospitalId, requesting_hospital_name: hospitalName,
    referring_hospital_id: hospitalId, referring_hospital_name: hospitalName, claiming_hospital_id: hospitalId, claiming_hospital_name: hospitalName,
    doctor_name: "WhatsApp automated intake", urgency: "routine", source: "whatsapp",
    clinical_notes: JSON.stringify({ source: "whatsapp", whatsapp_message_id: whatsappMessageId, captured_at: new Date().toISOString() }),
    whatsapp_raw_message: whatsappMessageId, status: "pending", submitted_by: null,
  }).select("id, request_id, status").single();
  if (error || !row) throw new Error(`Direct DB fallback failed: ${error?.message || "unknown"}`);
  return { id: row.id, request_id: row.request_id, status: row.status };
}

async function getConversation(supabase: ReturnType<typeof getServiceClient>, phone: string) {
  const { data } = await supabase.from("whatsapp_conversations").select("*").eq("phone_number", phone).maybeSingle();
  if (data) return data;
  const { data: created } = await supabase.from("whatsapp_conversations").insert({ phone_number: phone, pending_data: {} }).select("*").single();
  return created || { phone_number: phone, pending_data: {} };
}

async function updateConversation(supabase: ReturnType<typeof getServiceClient>, phone: string, updates: Record<string, unknown>) {
  await supabase.from("whatsapp_conversations").update({ ...updates, updated_at: new Date().toISOString(), last_message_at: new Date().toISOString() }).eq("phone_number", phone);
}

async function findSenderRequests(supabase: ReturnType<typeof getServiceClient>, phone: string) {
  const { data: linked } = await supabase.from("whatsapp_messages").select("authorization_request_id").eq("phone_number", phone).not("authorization_request_id", "is", null);
  const ids = [...new Set((linked || []).map((x: any) => x.authorization_request_id).filter(Boolean))] as string[];
  if (!ids.length) return [];
  const { data } = await supabase.from("authorization_requests").select("id, request_id, patient_name, policy_number, status, decision_reason, diagnosis, treatment, hospital_name, created_at").in("id", ids).order("created_at", { ascending: false }).limit(10);
  return data || [];
}

async function processMessageBody(supabase: ReturnType<typeof getServiceClient>, row: { message_id: string; phone_number: string; message_type: string; message_body: string | null }) {
  const messageId = row.message_id;
  const rawText = row.message_body || "";
  const blocks = splitPatientBlocks(rawText);
  const conversation = await getConversation(supabase, row.phone_number);
  const pendingData: Record<string, string> = conversation?.pending_data && typeof conversation.pending_data === "object" ? conversation.pending_data : {};
  const { data: history } = await supabase.from("whatsapp_messages").select("message_body, received_at, message_type").eq("phone_number", row.phone_number).order("received_at", { ascending: false }).limit(8);
  const context = buildContext(conversation, (history || []).reverse());
  let finalReply: string | null = null;
  let priority = 0;

  for (const blockText of blocks) {
    let analysis: GeminiAnalysisResult;
    const trimmed = blockText.trim();
    const fastGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)\.?$/i;
    const fastChatter = /^(thanks|thank you|thank you very much|ok|okay|noted|alright|received|got it|test|testing)\.?$/i;
    const fastHelp = /^(help|info|how to use|support|assistance)\.?$/i;
    const fastCancel = /^(cancel|cancel request|stop|start over|reset|nevermind)\.?$/i;
    try {
      if (fastCancel.test(trimmed)) analysis = { intent: "CANCELLATION", urgencyLevel: 3, missingInfo: [], isCancellationIntent: true };
      else if (fastGreeting.test(trimmed)) analysis = { intent: "GREETING", urgencyLevel: 3, missingInfo: [], isCancellationIntent: false };
      else if (fastChatter.test(trimmed)) analysis = { intent: "GENERAL_CONVERSATION", urgencyLevel: 3, missingInfo: [], isCancellationIntent: false };
      else if (fastHelp.test(trimmed)) analysis = { intent: "HELP", urgencyLevel: 3, missingInfo: [], isCancellationIntent: false };
      else if (row.message_type === "text" && trimmed) analysis = brainGuard(trimmed, await extractWithGemini(trimmed, context), conversation);
      else analysis = { intent: "NON_TEXT_MESSAGE", urgencyLevel: 3, missingInfo: [], isCancellationIntent: false };
      await supabase.from("whatsapp_messages").update({ extracted: analysis as any }).eq("message_id", messageId);
    } catch (e) {
      log("brain", messageId, "error", { error: (e as Error).message });
      analysis = brainGuard(trimmed, { intent: "UNKNOWN", urgencyLevel: 3, missingInfo: [], isCancellationIntent: false }, conversation);
    }

    let intent = String(analysis.intent || "UNKNOWN").toUpperCase();
    if (analysis.isCancellationIntent) intent = "CANCELLATION";
    await updateConversation(supabase, row.phone_number, { active_intent: intent });

    if (intent === "CANCELLATION") {
      await updateConversation(supabase, row.phone_number, { pending_data: {}, active_intent: "CANCELLATION", active_authorization_id: null });
      finalReply = "Your pending authorization draft has been cancelled. How else can I assist you? — Ronsberger HMO";
      priority = 4;
      continue;
    }

    if (["GREETING", "GENERAL_CONVERSATION", "HELP", "NO_AUTHORIZATION", "UNKNOWN", "NON_TEXT_MESSAGE", "PROVIDER_QUERY"].includes(intent)) {
      let reply = "";
      if (intent === "GREETING") reply = "Hello! Welcome to Ronsberger HMO Medical Authorization Portal.\n\nHow can I assist you today? You can submit a patient authorization request or check request status anytime.";
      else if (intent === "HELP") reply = "Welcome to Ronsberger HMO Authorization Assistant.\n\n• To submit an authorization: Send patient details (Name, NHIA/Policy No, Diagnosis, Treatment/Procedures, Hospital).\n• To check status: Ask 'What is the status of [Patient Name]?'\n\n— Ronsberger HMO";
      else if (intent === "PROVIDER_QUERY") reply = "Sure. I can help with provider information. Please tell me the service or type of provider you need and your preferred location.\n\n— Ronsberger HMO";
      else if (intent === "GENERAL_CONVERSATION" && analysis.conversationalReply?.trim()) reply = `${analysis.conversationalReply.trim()}\n\n— Ronsberger HMO`;
      else if (intent === "NON_TEXT_MESSAGE") reply = "I can currently process medical authorization details sent as text. Please send the patient information as a text message.\n\n— Ronsberger HMO";
      else reply = "Thank you for contacting Ronsberger HMO.\n\nIf you need to submit a patient authorization or check the status of a request, please tell me what you need help with.\n\n— Ronsberger HMO";
      if (priority < 1) { finalReply = reply; priority = 1; }
      continue;
    }

    if (["AUTHORIZATION_STATUS", "APPROVAL_QUERY", "REJECTION_QUERY", "AUTHORIZATION_DETAILS"].includes(intent)) {
      const name = analysis.queryPatientName || analysis.patientName || null;
      const policy = analysis.queryPolicyNumber || analysis.policyNumber || null;
      const requests = await findSenderRequests(supabase, row.phone_number);
      let candidates = requests;
      if (policy) candidates = candidates.filter((r: any) => String(r.policy_number || "").toLowerCase().includes(String(policy).toLowerCase()));
      else if (name) {
        const n = String(name).toLowerCase();
        candidates = candidates.filter((r: any) => String(r.patient_name || "").toLowerCase().includes(n) || n.includes(String(r.patient_name || "").toLowerCase()));
      }
      if (candidates.length > 1) {
        const list = candidates.slice(0, 5).map((r: any) => `• ${r.patient_name} (${r.request_id}) — ${(r.status || "pending").toUpperCase()}`).join("\n");
        finalReply = `I found more than one authorization request from this number. Please provide the patient's full name or NHIA/NHIS number so I can check the correct one.\n\n${list}\n\n— Ronsberger HMO`;
        priority = Math.max(priority, 2);
        continue;
      }
      if (!candidates.length) {
        const missingQuery = !name && !policy;
        finalReply = missingQuery
          ? "I can check the status for you. Please provide the patient's name or NHIA/NHIS number so I can identify the request.\n\n— Ronsberger HMO"
          : "I could not find an authorization request matching that patient or number from this WhatsApp number. Please check the name or NHIA/NHIS number and try again.\n\n— Ronsberger HMO";
        priority = Math.max(priority, 2);
        continue;
      }
      const r: any = candidates[0];
      await supabase.from("whatsapp_messages").update({ authorization_request_id: r.id }).eq("message_id", messageId);
      const ref = r.request_id || r.id.slice(0, 8);
      const status = String(r.status || "pending").toLowerCase();
      let reply = "";
      if (intent === "AUTHORIZATION_DETAILS") reply = `Authorization Details\n\nPatient: ${r.patient_name}\nNHIA/NHIS: ${r.policy_number || "Not specified"}\nDiagnosis: ${r.diagnosis || "Not specified"}\nTreatment/Services: ${r.treatment || "Not specified"}\nHospital: ${r.hospital_name || "Not specified"}\nStatus: ${status.toUpperCase()}\n\n— Ronsberger HMO`;
      else if (status === "approved") reply = `Authorization Update\n\n${r.patient_name}'s medical authorization request (Ref: ${ref}) has been APPROVED.\n\nYou may proceed according to the approved details.\n\n— Ronsberger HMO`;
      else if (status === "rejected") reply = `Authorization Update\n\n${r.patient_name}'s medical authorization request (Ref: ${ref}) was NOT APPROVED.\n\nReason:\n${r.decision_reason || "Does not meet clinical policy guidelines"}\n\nIf you need clarification, please reply to this message.\n\n— Ronsberger HMO`;
      else reply = `Authorization Update\n\n${r.patient_name}'s medical authorization request (Ref: ${ref}) is currently ${status.toUpperCase()}.\n\nWe will notify you once a final decision is available.\n\n— Ronsberger HMO`;
      if (priority < 2) { finalReply = reply; priority = 2; }
      continue;
    }

    if (["NEW_AUTHORIZATION", "INCOMPLETE_AUTHORIZATION", "CONTINUE_AUTHORIZATION"].includes(intent)) {
      const raw = extractAuthFieldsFromRaw(blockText);
      const current = { ...pendingData };
      const newName = analysis.patientName || raw.patientName;
      const newPolicy = analysis.policyNumber || raw.policyNumber;
      if ((current.patientName || current.policyNumber) && (newName || newPolicy)) {
        const sameName = !!newName && !!current.patientName && newName.toLowerCase().trim() === String(current.patientName).toLowerCase().trim();
        const samePolicy = !!newPolicy && !!current.policyNumber && newPolicy.toLowerCase().trim() === String(current.policyNumber).toLowerCase().trim();
        if (!sameName && !samePolicy) Object.keys(current).forEach(k => delete current[k]);
      }
      const patientName = newName || current.patientName || null;
      const policyNumber = newPolicy || current.policyNumber || null;
      const diagnosis = analysis.diagnosis || raw.diagnosis || current.diagnosis || null;
      const treatment = analysis.treatment || raw.treatment || current.treatment || null;
      const procedure = analysis.procedure || raw.procedure || current.procedure || null;
      const investigation = analysis.investigation || raw.investigation || current.investigation || null;
      const requestedService = analysis.requestedService || raw.requestedService || current.requestedService || null;
      const hospital = analysis.originatingHospital || raw.originatingHospital || current.originatingHospital || "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)";
      const referral = analysis.referralHospital || current.referralHospital || null;
      const service = treatment || procedure || investigation || requestedService;
      const missing: string[] = [];
      if (!patientName) missing.push("Patient Name");
      if (!policyNumber) missing.push("NHIA / Policy Number");
      if (!diagnosis) missing.push("Diagnosis / Clinical Complaint");
      if (!service) missing.push("Requested Treatment, Procedure, or Service");
      if (missing.length) {
        await updateConversation(supabase, row.phone_number, { pending_data: { patientName, policyNumber, diagnosis, treatment, procedure, investigation, requestedService, originatingHospital: hospital, referralHospital: referral }, active_intent: "INCOMPLETE_AUTHORIZATION" });
        finalReply = `I have started your authorization request${patientName ? ` for ${patientName}` : ""}, but I still need:\n\n${missing.map(x => `• ${x}`).join("\n")}\n\nPlease reply with the missing details to complete the request.\n\n— Ronsberger HMO`;
        priority = Math.max(priority, 3);
        continue;
      }

      const existing = await findSenderRequests(supabase, row.phone_number);
      const duplicate = existing.find((r: any) => String(r.patient_name || "").toLowerCase() === patientName!.toLowerCase() && String(r.policy_number || "").toLowerCase() === policyNumber!.toLowerCase() && String(r.diagnosis || "").toLowerCase().includes(diagnosis!.toLowerCase()) && String(r.treatment || "").toLowerCase().includes(String(service).toLowerCase()));
      if (duplicate) {
        finalReply = `It looks like an authorization request for ${patientName} was recently submitted from this number (Ref: ${duplicate.request_id}). It is currently ${(duplicate.status || "pending").toUpperCase()}.\n\nIf this is a new request for the same patient, please reply with the updated clinical details.\n\n— Ronsberger HMO`;
        await updateConversation(supabase, row.phone_number, { pending_data: {} });
        priority = Math.max(priority, 3);
        continue;
      }

      const result = await postAuthorization(supabase, {
        source: "whatsapp", whatsapp_message_id: messageId, patient_name: patientName, policy_number: policyNumber,
        diagnosis, treatment: service, phone_number: analysis.patientPhone || row.phone_number, hospital_name: hospital,
        referral_hospital_name: referral, urgency_level: analysis.urgencyLevel ?? 3, missing_info: [], raw_message: blockText,
      });
      await supabase.from("whatsapp_messages").update({ authorization_request_id: result.id, internal_request_id: result.id }).eq("message_id", messageId);
      await updateConversation(supabase, row.phone_number, { pending_data: {}, active_intent: "COMPLETED", last_patient_name: patientName, last_policy_number: policyNumber, active_authorization_id: result.id });
      finalReply = `Your medical authorization request for ${patientName} has been received successfully.\n\nOur team will review it and update you here once a decision is available.\n\n— Ronsberger HMO`;
      priority = Math.max(priority, 3);
      log("authorization", messageId, "ok", { request_id: result.request_id });
    }
  }
  if (finalReply) await sendWhatsAppMessage(row.phone_number, finalReply);
}

async function processOne(supabase: ReturnType<typeof getServiceClient>, messageId: string) {
  const { data: row, error } = await supabase.from("whatsapp_messages").select("id, message_id, phone_number, message_type, message_body, attempts, status, raw_message").eq("message_id", messageId).maybeSingle();
  if (error || !row) { log("load", messageId, "error", { error: error?.message }); return; }
  if (row.status === "completed" || row.status === "processing") return;
  const { data: claimed, error: claimError } = await supabase.from("whatsapp_messages").update({ status: "processing", attempts: (row.attempts || 0) + 1 }).eq("message_id", messageId).in("status", ["queued", "retry"]).select("message_id");
  if (claimError || !claimed?.length) { if (claimError) log("claim", messageId, "error", { error: claimError.message }); return; }
  const phone = String(row.phone_number || "");
  if (phone.includes("@g.us") || phone.includes("status@broadcast")) { await supabase.from("whatsapp_messages").update({ status: "completed" }).eq("message_id", messageId); return; }
  try {
    await processMessageBody(supabase, row);
    await supabase.from("whatsapp_messages").update({ status: "completed", last_error: null, processed_at: new Date().toISOString(), template_sent_at: new Date().toISOString() }).eq("message_id", messageId);
  } catch (e) {
    const msg = (e as Error).message || "unknown";
    log("process", messageId, "error", { error: msg });
    await supabase.from("whatsapp_messages").update({ status: "retry", next_attempt_at: new Date(Date.now() + 30000).toISOString(), last_error: msg.slice(0, 500) }).eq("message_id", messageId);
  }
}

async function processNotifications(supabase: ReturnType<typeof getServiceClient>) {
  const { data: notes } = await supabase.from("whatsapp_notifications").select("*").in("status", ["pending", "retry"]).lt("attempts", MAX_ATTEMPTS).order("created_at", { ascending: true }).limit(WORKER_BATCH);
  for (const note of notes || []) {
    try {
      const { data: msgs } = await supabase.from("whatsapp_messages").select("phone_number").eq("authorization_request_id", note.authorization_request_id).order("received_at", { ascending: true }).limit(1);
      const recipient = msgs?.[0]?.phone_number || note.phone_number;
      const { data: auth } = await supabase.from("authorization_requests").select("patient_name, status, decision_reason").eq("id", note.authorization_request_id).single();
      if (!recipient || !auth) throw new Error("notification target/request missing");
      let body = "";
      if (note.notification_type === "APPROVAL") body = `Authorization Update\n\n${auth.patient_name}'s medical authorization request has been approved.\n\n— Ronsberger HMO`;
      else if (note.notification_type === "REJECTION") body = `Authorization Update\n\n${auth.patient_name}'s medical authorization request has not been approved.\n\nReason: ${auth.decision_reason || "Does not meet clinical policy guidelines"}\n\nIf you need clarification or would like to provide additional information, please reply to this message.\n\n— Ronsberger HMO`;
      else throw new Error("unknown notification type");
      await sendWhatsAppMessage(recipient, body);
      await supabase.from("whatsapp_notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", note.id);
    } catch (e) {
      await supabase.from("whatsapp_notifications").update({ status: "retry", attempts: (note.attempts || 0) + 1, last_error: (e as Error).message }).eq("id", note.id);
    }
  }
}

async function pollAndProcess(supabase: ReturnType<typeof getServiceClient>) {
  const now = new Date().toISOString();
  const { data: rows } = await supabase.from("whatsapp_messages").select("message_id, status, next_attempt_at").or("status.eq.queued,status.eq.retry").or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`).order("received_at", { ascending: true }).limit(WORKER_BATCH);
  await processNotifications(supabase);
  for (const r of rows || []) await processOne(supabase, r.message_id);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (bearer !== serviceKey) {
    if (!WORKER_SECRET || req.headers.get("x-worker-secret") !== WORKER_SECRET) return new Response("forbidden", { status: 403 });
  }
  const supabase = getServiceClient();
  let body: any = {}; try { body = await req.json(); } catch {}
  if (body?.message_id) await processOne(supabase, String(body.message_id));
  else await pollAndProcess(supabase);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
