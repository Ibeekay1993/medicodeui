// whatsapp-worker/index.ts
// Ronsberger HMO WhatsApp AI conversation worker.
// AI interprets intent and entities; deterministic code owns database/business actions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildContext,
  deriveProviderSearchTerm,
  deterministicFallbackAnalysis,
  extractAuthFieldsFromRaw,
  hasStrongAuthIndicators,
  splitPatientBlocks,
} from "./brain.ts";
import {
  analyzeMessage,
  type GeminiAnalysisResult,
} from "./providers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
};
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const MEDAUTH_BASE_URL =
  Deno.env.get("MEDAUTH_INTERNAL_BASE_URL") ||
  Deno.env.get("SUPABASE_URL") ||
  "";
const MEDAUTH_INTERNAL_PATH =
  Deno.env.get("MEDAUTH_INTERNAL_PATH") || "/functions/v1/submit-authorization";
const MEDAUTH_API_KEY = Deno.env.get("MEDAUTH_INTERNAL_API_KEY") || "";
const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const EVOLUTION_INSTANCE_NAME =
  Deno.env.get("EVOLUTION_INSTANCE_NAME") || "medicode-test";
const WORKER_SECRET = Deno.env.get("WHATSAPP_WORKER_SECRET") || "";
const MAX_ATTEMPTS = Number(Deno.env.get("WHATSAPP_MAX_ATTEMPTS") || "5");
const WORKER_BATCH = Number(Deno.env.get("WHATSAPP_WORKER_BATCH") || "10");

// AI provider failover config (Gemini → Groq → Modal → deterministic brain).
// Values are read from environment at cold start; secrets are never logged.
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "";
const MODAL_ENDPOINT = Deno.env.get("MODAL_ENDPOINT") || "";
const MODAL_WEBHOOK_SECRET = Deno.env.get("MODAL_WEBHOOK_SECRET") || "";
const providerEnv = {
  geminiApiKey: GEMINI_API_KEY,
  geminiModel: GEMINI_MODEL,
  groqApiKey: GROQ_API_KEY,
  groqModel: GROQ_MODEL,
  modalEndpoint: MODAL_ENDPOINT,
  modalWebhookSecret: MODAL_WEBHOOK_SECRET,
  geminiTimeoutMs: Number(Deno.env.get("GEMINI_TIMEOUT_MS") || "10000") || 10000,
  groqTimeoutMs: Number(Deno.env.get("GROQ_TIMEOUT_MS") || "10000") || 10000,
  modalTimeoutMs: Number(Deno.env.get("MODAL_TIMEOUT_MS") || "10000") || 10000,
};

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
function log(
  stage: string,
  message_id: string,
  status: "ok" | "error" | "skipped",
  detail?: unknown,
) {
  console.log(
    JSON.stringify({
      stage,
      message_id,
      status,
      ...(detail && typeof detail === "object" ? detail : {}),
    }),
  );
  getServiceClient()
    .from("whatsapp_processing_log")
    .insert({ message_id, stage, status, detail: detail ?? null })
    .then(() => {});
}

async function sendWhatsAppMessage(toPhone: string, text: string) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY)
    throw new Error("Evolution creds missing");
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE_NAME)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ number: toPhone, text }),
  });
  const body = await res.text();
  if (!res.ok)
    throw new Error(`Evolution send ${res.status}: ${body.slice(0, 200)}`);
  return body;
}
async function postAuthorization(
  supabase: ReturnType<typeof getServiceClient>,
  payload: Record<string, unknown>,
) {
  try {
    const url = `${MEDAUTH_BASE_URL.replace(/\/$/, "")}${MEDAUTH_INTERNAL_PATH}`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey || MEDAUTH_API_KEY}`,
      apikey: serviceKey || MEDAUTH_API_KEY,
    };
    if (MEDAUTH_API_KEY) headers["x-api-key"] = MEDAUTH_API_KEY;
    if (WORKER_SECRET) headers["x-worker-secret"] = WORKER_SECRET;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const j = await res.json();
      if (j?.id)
        return {
          id: String(j.id),
          request_id: j.request_id ? String(j.request_id) : undefined,
          status: j.status ? String(j.status) : undefined,
        };
    }
  } catch (e) {
    console.warn(
      "submit-authorization invoke failed; using DB fallback",
      (e as Error).message,
    );
  }
  const patientName = String(payload.patient_name || "").trim(),
    policyNumber = String(payload.policy_number || "").trim(),
    diagnosis = String(payload.diagnosis || "").trim(),
    treatment = String(payload.treatment || "").trim(),
    hospitalName = String(
      payload.hospital_name ||
        "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
    ).trim(),
    phoneNumber = String(payload.phone_number || "").trim(),
    whatsappMessageId = String(payload.whatsapp_message_id || "");
  let hospitalId: string | null = null;
  const { data: hosp } = await supabase
    .from("hospitals")
    .select("id")
    .ilike("name", `%${hospitalName}%`)
    .limit(1)
    .maybeSingle();
  if (hosp?.id) hospitalId = hosp.id;
  const { data: row, error } = await supabase
    .from("authorization_requests")
    .insert({
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
    })
    .select("id, request_id, status")
    .single();
  if (error || !row)
    throw new Error(
      `Direct DB fallback failed: ${error?.message || "unknown"}`,
    );
  return { id: row.id, request_id: row.request_id, status: row.status };
}
async function getConversation(
  supabase: ReturnType<typeof getServiceClient>,
  phone: string,
) {
  const { data } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("phone_number", phone)
    .maybeSingle();
  if (data) return data;
  const { data: created } = await supabase
    .from("whatsapp_conversations")
    .insert({ phone_number: phone, pending_data: {} })
    .select("*")
    .single();
  return created || { phone_number: phone, pending_data: {} };
}
async function updateConversation(
  supabase: ReturnType<typeof getServiceClient>,
  phone: string,
  updates: Record<string, unknown>,
) {
  await supabase
    .from("whatsapp_conversations")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    .eq("phone_number", phone);
}
async function findSenderRequests(
  supabase: ReturnType<typeof getServiceClient>,
  phone: string,
) {
  const { data: linked } = await supabase
    .from("whatsapp_messages")
    .select("authorization_request_id")
    .eq("phone_number", phone)
    .not("authorization_request_id", "is", null);
  const ids = [
    ...new Set(
      (linked || [])
        .map((x: any) => x.authorization_request_id)
        .filter(Boolean),
    ),
  ] as string[];
  if (!ids.length) return [];
  const { data } = await supabase
    .from("authorization_requests")
    .select(
      "id, request_id, patient_name, policy_number, status, decision_reason, diagnosis, treatment, hospital_name, created_at",
    )
    .in("id", ids)
    .order("created_at", { ascending: false })
    .limit(20);
  return data || [];
}

// ── Deterministic provider information lookup (get_provider_information) ─────
// Searches the HMO provider directory (hospitals table) by name or state.
// Returns only public directory fields — never UUIDs or internal codes.
async function getProviderInformation(
  supabase: ReturnType<typeof getServiceClient>,
  searchTerm: string,
  messageId: string,
) {
  const term = String(searchTerm || "").trim();
  if (!term) return [];
  let query = supabase
    .from("hospitals")
    .select("name, state, phone, address")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(6);
  if (term) query = query.or(`name.ilike.%${term}%,state.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) {
    log("provider_lookup", messageId, "error", { error: error.message });
    return null;
  }
  return data || [];
}

async function processMessageBody(
  supabase: ReturnType<typeof getServiceClient>,
  row: {
    message_id: string;
    phone_number: string;
    message_type: string;
    message_body: string | null;
  },
) {
  const messageId = row.message_id,
    rawText = row.message_body || "",
    blocks = splitPatientBlocks(rawText),
    conversation = await getConversation(supabase, row.phone_number),
    pendingData: Record<string, string> =
      conversation?.pending_data &&
      typeof conversation.pending_data === "object"
        ? conversation.pending_data
        : {};
  const { data: history } = await supabase
    .from("whatsapp_messages")
    .select("message_body, received_at, message_type")
    .eq("phone_number", row.phone_number)
    .order("received_at", { ascending: false })
    .limit(8);
  const context = buildContext(conversation, (history || []).reverse());
  let finalReply: string | null = null,
    priority = 0;
  // Duplicate-call guard: Evolution re-delivery can repeat an identical block
  // inside one payload. Memoize analyses per normalized block so each distinct
  // block costs exactly one Gemini call (cross-invocation duplicates are
  // already prevented by the status CAS claim in processOne).
  const blockAnalysisCache = new Map<string, GeminiAnalysisResult>();
  for (const blockText of blocks) {
    let analysis: GeminiAnalysisResult;
    const trimmed = blockText.trim();
    const fastGreeting =
        /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)\.?$/i,
      fastChatter =
        /^(thanks|thank you|thank you very much|ok|okay|noted|alright|received|got it|test|testing)\.?$/i,
      fastHelp = /^(help|info|how to use|support|assistance)\.?$/i,
      fastCancel =
        /^(cancel|cancel request|stop|start over|reset|nevermind)\.?$/i,
      // The webhook stores media captions in message_body with a non-"text"
      // message_type (e.g. "image"). Any real text — including captions —
      // must be interpreted; only bare placeholders are skipped.
      placeholderOnly =
        /^\s*\[(?:image|audio|video|document|location|sticker)\]\s*$/i;
    try {
      if (fastCancel.test(trimmed))
        analysis = {
          intent: "CANCELLATION",
          urgencyLevel: 3,
          missingInfo: [],
          isCancellationIntent: true,
        };
      else if (fastGreeting.test(trimmed))
        analysis = {
          intent: "GREETING",
          urgencyLevel: 3,
          missingInfo: [],
          isCancellationIntent: false,
        };
      else if (fastChatter.test(trimmed))
        analysis = {
          intent: "GENERAL_CONVERSATION",
          urgencyLevel: 3,
          missingInfo: [],
          isCancellationIntent: false,
        };
      else if (fastHelp.test(trimmed))
        analysis = {
          intent: "HELP",
          urgencyLevel: 3,
          missingInfo: [],
          isCancellationIntent: false,
        };
      else if (trimmed && !placeholderOnly.test(trimmed)) {
        const cacheKey = trimmed.toLowerCase().replace(/\s+/g, " ");
        const cached = blockAnalysisCache.get(cacheKey);
        if (cached) {
          analysis = { ...cached, raw: undefined };
        } else {
          // AI provider failover: Gemini → Groq → Modal (if configured) →
          // deterministic fallback. The router never throws and always returns
          // a valid AnalysisResult, so 429 on one provider immediately moves
          // to the next instead of retrying the same exhausted provider.
          analysis = await analyzeMessage(
            trimmed,
            context,
            messageId,
            conversation,
            { env: providerEnv, log },
          );
          blockAnalysisCache.set(cacheKey, analysis);
        }
      } else
        analysis = {
          intent: "NON_TEXT_MESSAGE",
          urgencyLevel: 3,
          missingInfo: [],
          isCancellationIntent: false,
        };
      await supabase
        .from("whatsapp_messages")
        .update({ extracted: analysis as any })
        .eq("message_id", messageId);
    } catch (e) {
      log("brain", messageId, "error", { error: (e as Error).message });
      analysis = deterministicFallbackAnalysis(trimmed, conversation);
    }
    let intent = String(analysis.intent || "UNKNOWN").toUpperCase();
    if (analysis.isCancellationIntent) intent = "CANCELLATION";
    await updateConversation(supabase, row.phone_number, {
      active_intent: intent,
    });
    if (intent === "CANCELLATION") {
      await updateConversation(supabase, row.phone_number, {
        pending_data: {},
        active_intent: "CANCELLATION",
        active_authorization_id: null,
      });
      finalReply =
        "Your pending authorization draft has been cancelled. How else can I assist you? — Ronsberger HMO";
      priority = 4;
      continue;
    }
    // ── PROVIDER QUERIES (deterministic directory lookup) ────────────────────
    // Phase 9: understand natural provider questions; look up the provider
    // directory when the message names a service/location, otherwise ask the
    // minimum useful clarification. Never fabricate provider data.
    if (intent === "PROVIDER_QUERY") {
      const term = deriveProviderSearchTerm(blockText);
      let providers = term
        ? await getProviderInformation(supabase, term, messageId)
        : [];
      if (providers && !providers.length && term.includes(" ")) {
        // Retry with just the likely location/service word.
        const lastWord = String(term.split(/\s+/).pop() || "");
        providers = await getProviderInformation(
          supabase,
          lastWord,
          messageId,
        );
      }
      let providerReply: string;
      if (providers && providers.length) {
        const list = providers
          .slice(0, 5)
          .map(
            (p: any) =>
              `• ${p.name}${p.state ? ` — ${p.state}` : ""}${p.phone ? ` — ${p.phone}` : ""}`,
          )
          .join("\n");
        providerReply = `Here are Ronsberger HMO providers matching "${term}":\n\n${list}\n\nPlease contact the facility to confirm availability before visiting.\n\n— Ronsberger HMO`;
      } else if (term) {
        providerReply = `I could not find a Ronsberger HMO provider matching "${term}" in our directory. Please tell me the type of service or another location and I will check again.\n\n— Ronsberger HMO`;
      } else {
        providerReply =
          "Sure — I can look up Ronsberger HMO providers for you. Please tell me the type of service you need and/or your location (for example: 'hospitals in Ibadan').\n\n— Ronsberger HMO";
      }
      if (priority < 1) {
        finalReply = providerReply;
        priority = 1;
      }
      continue;
    }
    if (
      [
        "GREETING",
        "GENERAL_CONVERSATION",
        "HELP",
        "NO_AUTHORIZATION",
        "UNKNOWN",
        "NON_TEXT_MESSAGE",
      ].includes(intent)
    ) {
      let reply = "";
      if (intent === "GREETING")
        reply =
          "Hello! Welcome to Ronsberger HMO Medical Authorization Portal.\n\nHow can I assist you today? You can submit a patient authorization request or check request status anytime.";
      else if (intent === "HELP")
        reply =
          "Welcome to Ronsberger HMO Authorization Assistant.\n\n• To submit an authorization: Send patient details (Name, NHIA/Policy No, Diagnosis, Treatment/Procedures, Hospital).\n• To check status: Ask 'What is the status of [Patient Name]?'\n• For providers: Ask e.g. 'Which hospitals can I use in Ibadan?'\n\n— Ronsberger HMO";
      else if (
        intent === "GENERAL_CONVERSATION" &&
        analysis.conversationalReply?.trim()
      )
        reply = `${analysis.conversationalReply.trim()}\n\n— Ronsberger HMO`;
      else if (intent === "NON_TEXT_MESSAGE")
        reply =
          "I can currently process medical authorization details sent as text. Please send the patient information as a text message.\n\n— Ronsberger HMO";
      else
        reply =
          "Thank you for contacting Ronsberger HMO.\n\nIf you need to submit a patient authorization or check the status of a request, please tell me what you need help with.\n\n— Ronsberger HMO";
      if (priority < 1) {
        finalReply = reply;
        priority = 1;
      }
      continue;
    }
    if (
      [
        "AUTHORIZATION_STATUS",
        "APPROVAL_QUERY",
        "REJECTION_QUERY",
        "AUTHORIZATION_DETAILS",
      ].includes(intent)
    ) {
      const name = analysis.queryPatientName || analysis.patientName || null,
        policy = analysis.queryPolicyNumber || analysis.policyNumber || null;
      const requests = await findSenderRequests(supabase, row.phone_number);
      let candidates = requests;
      if (policy)
        candidates = candidates.filter((r: any) =>
          String(r.policy_number || "")
            .toLowerCase()
            .includes(String(policy).toLowerCase()),
        );
      else if (name) {
        const n = String(name).toLowerCase();
        candidates = candidates.filter(
          (r: any) =>
            String(r.patient_name || "")
              .toLowerCase()
              .includes(n) ||
            n.includes(String(r.patient_name || "").toLowerCase()),
        );
      }
      if (candidates.length > 1) {
        const list = candidates
          .slice(0, 5)
          .map(
            (r: any) =>
              `• ${r.patient_name} — ${(r.status || "pending").toUpperCase()}`,
          )
          .join("\n");
        finalReply = `I found more than one authorization request from this number. Please provide the patient's full name or NHIA/NHIS number so I can check the correct one.\n\n${list}\n\n— Ronsberger HMO`;
        priority = Math.max(priority, 2);
        continue;
      }
      if (!candidates.length) {
        finalReply =
          !name && !policy
            ? "I can check the status for you. Please provide the patient's name or NHIA/NHIS number so I can identify the request.\n\n— Ronsberger HMO"
            : "I could not find an authorization request matching that patient or number from this WhatsApp number. Please check the name or NHIA/NHIS number and try again.\n\n— Ronsberger HMO";
        priority = Math.max(priority, 2);
        continue;
      }
      const r: any = candidates[0];
      await supabase
        .from("whatsapp_messages")
        .update({ authorization_request_id: r.id })
        .eq("message_id", messageId);
      // Privacy: no internal database UUIDs or REQ- identifiers are exposed in customer WhatsApp messages.
      const status = String(r.status || "pending").toLowerCase();
      let reply = "";
      if (intent === "AUTHORIZATION_DETAILS")
        reply = `Authorization Details\n\nPatient: ${r.patient_name}\nNHIA/NHIS: ${r.policy_number || "Not specified"}\nDiagnosis: ${r.diagnosis || "Not specified"}\nTreatment/Services: ${r.treatment || "Not specified"}\nHospital: ${r.hospital_name || "Not specified"}\nStatus: ${status.toUpperCase()}\n\n— Ronsberger HMO`;
      else if (status === "approved")
        reply = `Authorization Update\n\n${r.patient_name}'s medical authorization request has been APPROVED.\n\nYou may proceed according to the approved details.\n\n— Ronsberger HMO`;
      else if (status === "rejected")
        reply = `Authorization Update\n\n${r.patient_name}'s medical authorization request was NOT APPROVED.\n\nReason:\n${r.decision_reason || "Does not meet clinical policy guidelines"}\n\nIf you need clarification, please reply to this message.\n\n— Ronsberger HMO`;
      else
        reply = `Authorization Update\n\n${r.patient_name}'s medical authorization request is currently ${status.toUpperCase()}.\n\nWe will notify you once a final decision is available.\n\n— Ronsberger HMO`;
      if (priority < 2) {
        finalReply = reply;
        priority = 2;
      }
      continue;
    }
    if (
      [
        "NEW_AUTHORIZATION",
        "INCOMPLETE_AUTHORIZATION",
        "CONTINUE_AUTHORIZATION",
      ].includes(intent)
    ) {
      const raw = extractAuthFieldsFromRaw(blockText),
        current = { ...pendingData },
        newName = analysis.patientName || raw.patientName,
        newPolicy = analysis.policyNumber || raw.policyNumber;
      if (
        (current.patientName || current.policyNumber) &&
        (newName || newPolicy)
      ) {
        const sameName =
            !!newName &&
            !!current.patientName &&
            newName.toLowerCase().trim() ===
              String(current.patientName).toLowerCase().trim(),
          samePolicy =
            !!newPolicy &&
            !!current.policyNumber &&
            newPolicy.toLowerCase().trim() ===
              String(current.policyNumber).toLowerCase().trim();
        if (!sameName && !samePolicy)
          Object.keys(current).forEach((k) => delete current[k]);
      }
      const patientName = newName || current.patientName || null,
        policyNumber = newPolicy || current.policyNumber || null,
        diagnosis =
          analysis.diagnosis || raw.diagnosis || current.diagnosis || null,
        treatment =
          analysis.treatment || raw.treatment || current.treatment || null,
        procedure =
          analysis.procedure || raw.procedure || current.procedure || null,
        investigation =
          analysis.investigation ||
          raw.investigation ||
          current.investigation ||
          null,
        requestedService =
          analysis.requestedService ||
          raw.requestedService ||
          current.requestedService ||
          null,
        hospital =
          analysis.originatingHospital ||
          raw.originatingHospital ||
          current.originatingHospital ||
          "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
        referral =
          analysis.referralHospital || current.referralHospital || null,
        service = treatment || procedure || investigation || requestedService,
        missing: string[] = [];
      if (!patientName) missing.push("Patient Name");
      if (!policyNumber) missing.push("NHIA / Policy Number");
      if (!diagnosis) missing.push("Diagnosis / Clinical Complaint");
      if (!service) missing.push("Requested Treatment, Procedure, or Service");
      if (missing.length) {
        await updateConversation(supabase, row.phone_number, {
          pending_data: {
            patientName,
            policyNumber,
            diagnosis,
            treatment,
            procedure,
            investigation,
            requestedService,
            originatingHospital: hospital,
            referralHospital: referral,
          },
          active_intent: "INCOMPLETE_AUTHORIZATION",
        });
        finalReply = `I have started your authorization request${patientName ? ` for ${patientName}` : ""}, but I still need:\n\n${missing.map((x) => `• ${x}`).join("\n")}\n\nPlease reply with the missing details to complete the request.\n\n— Ronsberger HMO`;
        priority = Math.max(priority, 3);
        continue;
      }
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const existing = await findSenderRequests(supabase, row.phone_number),
        duplicate = existing.find(
          (r: any) =>
            r.created_at >= cutoff &&
            String(r.patient_name || "").toLowerCase() ===
              patientName!.toLowerCase() &&
            String(r.policy_number || "").toLowerCase() ===
              policyNumber!.toLowerCase() &&
            String(r.diagnosis || "")
              .toLowerCase()
              .includes(diagnosis!.toLowerCase()) &&
            String(r.treatment || "")
              .toLowerCase()
              .includes(String(service).toLowerCase()),
        );
      if (duplicate) {
        finalReply = `It looks like an authorization request for ${patientName} was recently submitted from this number. It is currently ${(duplicate.status || "pending").toUpperCase()}.\n\nIf this is a new request for the same patient, please reply with the updated clinical details.\n\n— Ronsberger HMO`;
        await updateConversation(supabase, row.phone_number, {
          pending_data: {},
        });
        priority = Math.max(priority, 3);
        continue;
      }
      const result = await postAuthorization(supabase, {
        source: "whatsapp",
        whatsapp_message_id: messageId,
        patient_name: patientName,
        policy_number: policyNumber,
        diagnosis,
        treatment: service,
        phone_number: analysis.patientPhone || row.phone_number,
        hospital_name: hospital,
        referral_hospital_name: referral,
        urgency_level: analysis.urgencyLevel ?? 3,
        missing_info: [],
        raw_message: blockText,
      });
      await supabase
        .from("whatsapp_messages")
        .update({
          authorization_request_id: result.id,
          internal_request_id: result.id,
        })
        .eq("message_id", messageId);
      await updateConversation(supabase, row.phone_number, {
        pending_data: {},
        active_intent: "COMPLETED",
        last_patient_name: patientName,
        last_policy_number: policyNumber,
        active_authorization_id: result.id,
      });
      finalReply = `Your medical authorization request for ${patientName} has been received successfully.\n\nOur team will review it and update you here once a decision is available.\n\n— Ronsberger HMO`;
      priority = Math.max(priority, 3);
      log("authorization", messageId, "ok", { request_id: result.request_id });
    }
  }
  if (finalReply) await sendWhatsAppMessage(row.phone_number, finalReply);
}
async function processOne(
  supabase: ReturnType<typeof getServiceClient>,
  messageId: string,
) {
  const { data: row, error } = await supabase
    .from("whatsapp_messages")
    .select(
      "id, message_id, phone_number, message_type, message_body, attempts, status, raw_message",
    )
    .eq("message_id", messageId)
    .maybeSingle();
  if (error || !row) {
    log("load", messageId, "error", { error: error?.message });
    return;
  }
  if (row.status === "completed" || row.status === "processing") return;
  const { data: claimed, error: claimError } = await supabase
    .from("whatsapp_messages")
    .update({ status: "processing", attempts: (row.attempts || 0) + 1 })
    .eq("message_id", messageId)
    .in("status", ["queued", "retry"])
    .select("message_id");
  if (claimError || !claimed?.length) {
    if (claimError)
      log("claim", messageId, "error", { error: claimError.message });
    return;
  }
  try {
    await processMessageBody(supabase, row);
    await supabase
      .from("whatsapp_messages")
      .update({
        status: "completed",
        last_error: null,
        processed_at: new Date().toISOString(),
        template_sent_at: new Date().toISOString(),
      })
      .eq("message_id", messageId);
  } catch (e) {
    const msg = (e as Error).message || "unknown";
    log("process", messageId, "error", { error: msg });
    await supabase
      .from("whatsapp_messages")
      .update({
        status: "retry",
        next_attempt_at: new Date(Date.now() + 30000).toISOString(),
        last_error: msg.slice(0, 500),
      })
      .eq("message_id", messageId);
  }
}
async function processNotifications(
  supabase: ReturnType<typeof getServiceClient>,
) {
  const { data: notes } = await supabase
    .from("whatsapp_notifications")
    .select("*")
    .in("status", ["pending", "retry"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(WORKER_BATCH);
  for (const note of notes || []) {
    try {
      const { data: msgs } = await supabase
          .from("whatsapp_messages")
          .select("phone_number")
          .eq("authorization_request_id", note.authorization_request_id)
          .order("received_at", { ascending: true })
          .limit(1),
        recipient = msgs?.[0]?.phone_number || note.phone_number,
        { data: auth } = await supabase
          .from("authorization_requests")
          .select("patient_name,status,decision_reason")
          .eq("id", note.authorization_request_id)
          .single();
      if (!recipient || !auth)
        throw new Error("notification target/request missing");
      let body = "";
      if (note.notification_type === "APPROVAL")
        body = `Authorization Update\n\n${auth.patient_name}'s medical authorization request has been approved.\n\n— Ronsberger HMO`;
      else if (note.notification_type === "REJECTION")
        body = `Authorization Update\n\n${auth.patient_name}'s medical authorization request has not been approved.\n\nReason: ${auth.decision_reason || "Does not meet clinical policy guidelines"}\n\nIf you need clarification or would like to provide additional information, please reply to this message.\n\n— Ronsberger HMO`;
      else throw new Error("unknown notification type");
      await sendWhatsAppMessage(recipient, body);
      await supabase
        .from("whatsapp_notifications")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", note.id);
    } catch (e) {
      await supabase
        .from("whatsapp_notifications")
        .update({
          status: "retry",
          attempts: (note.attempts || 0) + 1,
          last_error: (e as Error).message,
        })
        .eq("id", note.id);
    }
  }
}
async function pollAndProcess(supabase: ReturnType<typeof getServiceClient>) {
  const now = new Date().toISOString();
  const { data: rows } = await supabase
    .from("whatsapp_messages")
    .select("message_id,status,next_attempt_at")
    .or("status.eq.queued,status.eq.retry")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("received_at", { ascending: true })
    .limit(WORKER_BATCH);
  await processNotifications(supabase);
  for (const r of rows || []) await processOne(supabase, r.message_id);
}
serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("authorization") || "",
    bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "",
    serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (
    bearer !== serviceKey &&
    (!WORKER_SECRET || req.headers.get("x-worker-secret") !== WORKER_SECRET)
  )
    return new Response("forbidden", { status: 403 });
  const supabase = getServiceClient();
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  if (body?.message_id) await processOne(supabase, String(body.message_id));
  else await pollAndProcess(supabase);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
