// whatsapp-worker/index.ts
// Ronsberger HMO WhatsApp AI conversation worker.
// AI interprets intent and entities; deterministic code owns database/business actions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { quotePostgrestFilterValue } from "../_shared/postgrest-filter.ts";
import {
  buildContext,
  brainGuard,
  deriveProviderSearchTerm,
  deterministicFallbackAnalysis,
  extractAuthFieldsFromRaw,
  combineRequestedServices,
  hasStrongAuthIndicators,
  normalizePhoneNumber,
  parsePolicyNumber,
  splitPatientBlocks,
} from "./brain.ts";
import {
  analyzeInboundBlock,
  shouldHoldAuthorizationForClarification,
} from "./analysis-mode.ts";
import {
  analyzeMessage,
  type GeminiAnalysisResult,
} from "./providers.ts";
import {
  sendWhatsAppMessage,
  getOutboundLedger,
  saveOutboundLedger,
  sendOutboundReply,
  formatDetailedDecisionMessage,
  formatPatientDecisionMessage,
} from "./response-dispatcher.ts";
import {
  draftIdentityConflicts,
  findExistingAuthorizationForMessage,
  findSenderRequests,
  getConversation,
  getProviderInformation,
  normalizeDraftName,
  postAuthorization,
  resolveHospitalSender,
  resumeExistingAuthorization,
  updateConversation,
} from "./authorizations-intake.ts";
import { processNotifications } from "./notification-dispatcher.ts";
import {
  classifyRetryFailure,
  isInboundMessageProcessable,
  getWorkerBatchSize,
  getQueuePlan,
  getStaleQueueCandidates,
  isOutboundAmbiguous,
  normalizeStatus,
  shouldSendOutbound,
} from "./queue-hardening.ts";
import {
  AI_CAPABLE_WORKER_MODE,
  DETERMINISTIC_ONLY_WORKER_MODE,
  MANUAL_TARIFF_REVIEW_NOTE,
  PENDING_WORKER_MODE_FIELD,
  WORKER_PROCESSING_MODE_FIELD,
  WORKER_PROCESSING_MODE_HEADER,
  canReusePendingData,
  getClinicalReviewNote,
  resolveWorkerProcessingMode,
  withWorkerModeOnPendingData,
  type WorkerProcessingMode,
} from "../_shared/whatsapp-worker-mode.ts";
import { getDecisionNotificationIdempotency } from "../_shared/whatsapp-notification-idempotency.ts";
import {
  getMessageAgeMs,
  isClinicallyDecidedAuthorization,
  isPastAutoProcessAgeLimit,
  parseAutoProcessAgeLimitMinutes,
} from "../_shared/authorization-state.ts";
import { ensureArrivalPin } from "../_shared/arrival-pin.ts";
import { schedulePendingAuthorizationPush } from "../_shared/pending-auth-push.ts";
import { parseWhatsAppHospitalContactResolution } from "../_shared/whatsapp-hospital-contact.ts";
import { constantTimeEqual, corsHeaders as sharedCorsHeaders } from "../_shared/auth.ts";

const corsHeaders = {
  ...sharedCorsHeaders,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Vary": "Origin",
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
// Cron is only a backstop; webhook-triggered requests are processed one at a
// time. Keep each scheduled invocation bounded to avoid long Edge requests.
const WORKER_BATCH = getWorkerBatchSize(
  Deno.env.get("WHATSAPP_WORKER_BATCH"),
);
// This is an operational auto-processing window, not a clinical expiry. Old
// messages are held for a fresh hospital submission; no authorization expires.
const MAX_AUTO_PROCESS_AGE_MINUTES = parseAutoProcessAgeLimitMinutes(
  Deno.env.get("WHATSAPP_MAX_AUTO_PROCESS_AGE_MINUTES"),
);
const OUTBOUND_DELAY_MS = Number(Deno.env.get("WHATSAPP_OUTBOUND_DELAY_MS") || "3000");
const OUTBOUND_REQUEST_TIMEOUT_MS = 12_000;
const PROCESSING_LEASE_MS = Number(Deno.env.get("WHATSAPP_PROCESSING_LEASE_MS") || "300000");
const UNREGISTERED_WINDOW_MS = 60_000;
const UNREGISTERED_MAX_MESSAGES = 3;

// AI provider failover config (Gemini â†’ Groq â†’ Modal â†’ deterministic brain).
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
const whatsappLogClient = getServiceClient();
const queuedProcessingLogs: Array<{
  message_id: string;
  stage: string;
  status: "ok" | "error" | "skipped";
  detail: unknown;
}> = [];
let processingLogFlushTimer: ReturnType<typeof setTimeout> | null = null;

function flushQueuedProcessingLogs() {
  if (!queuedProcessingLogs.length) return;
  const batch = queuedProcessingLogs.splice(0, queuedProcessingLogs.length);
  processingLogFlushTimer = null;
  whatsappLogClient
    .from("whatsapp_processing_log")
    .insert(
      batch.map((entry) => ({
        message_id: entry.message_id,
        stage: entry.stage,
        status: entry.status,
        detail: entry.detail ?? null,
      })),
    )
    .then(() => {}, () => {});
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
  queuedProcessingLogs.push({ message_id, stage, status, detail: detail ?? null });
  if (processingLogFlushTimer === null) {
    processingLogFlushTimer = setTimeout(() => flushQueuedProcessingLogs(), 5000);
  }
  if (queuedProcessingLogs.length >= 50) {
    flushQueuedProcessingLogs();
  }
}

async function writeProcessingAudit(
  supabase: ReturnType<typeof getServiceClient>,
  messageId: string,
  stage: string,
  status: "ok" | "error" | "skipped",
  detail: Record<string, unknown>,
) {
  const { error } = await supabase.from("whatsapp_processing_log").insert({
    message_id: messageId,
    stage,
    status,
    detail,
  });
  if (error) throw new Error(`processing_audit_failed: ${error.message}`);
}

function getNowIso() {
  return new Date().toISOString();
}

function getProcessingLeaseOwner() {
  return `whatsapp-worker-${crypto.randomUUID()}`;
}

async function setMessageStatus(
  supabase: ReturnType<typeof getServiceClient>,
  messageId: string,
  status: string,
  updates: Record<string, unknown> = {},
  owner?: string | null,
) {
  const next: Record<string, unknown> = {
    ...updates,
    status,
    status_updated_at: getNowIso(),
  };
  if (["completed", "failed", "stale"].includes(status)) {
    next.processed_at = next.status_updated_at;
    // next_attempt_at is NOT NULL in the production schema. Terminal rows are
    // excluded from retry scans, so retain the terminal transition time.
    next.next_attempt_at = next.status_updated_at;
    next.processing_owner = null;
    next.processing_lease_expires_at = null;
    next.processing_heartbeat_at = null;
  }
  let query = supabase
    .from("whatsapp_messages")
    .update(next)
    .eq("message_id", messageId);
  if (owner) query = query.eq("processing_owner", owner);
  const { data, error } = await query.select("message_id");
  if (error) throw error;
  if (owner && !data?.length) {
    throw new Error("processing lease lost");
  }
  return next;
}

async function touchProcessingLease(
  supabase: ReturnType<typeof getServiceClient>,
  messageId: string,
  owner: string,
  leaseMs = PROCESSING_LEASE_MS,
) {
  const expiresAt = new Date(Date.now() + leaseMs).toISOString();
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({
      processing_owner: owner,
      processing_lease_expires_at: expiresAt,
      processing_heartbeat_at: getNowIso(),
      status_updated_at: getNowIso(),
    })
    .eq("message_id", messageId)
    .eq("processing_owner", owner);
  if (error) throw error;
}

async function recoverStaleProcessingRows(
  supabase: ReturnType<typeof getServiceClient>,
) {
  const { data, error } = await supabase.rpc("recover_stale_whatsapp_processing");
  if (error) {
    log("stale_recovery", "worker", "error", { error: error.message });
    return;
  }
  const recoveredCount = Number(data || 0);
  if (recoveredCount > 0) {
    log("stale_recovery", "worker", "ok", { recovered_count: recoveredCount });
  }
}

async function processMessageBody(
  supabase: ReturnType<typeof getServiceClient>,
  row: {
    message_id: string;
    phone_number: string;
    message_type: string;
    message_body: string | null;
    authorization_request_id?: string | null;
    internal_request_id?: string | null;
  },
  processingMode: WorkerProcessingMode = AI_CAPABLE_WORKER_MODE,
) {
  const messageId = row.message_id,
    rawText = row.message_body || "",
    blocks = splitPatientBlocks(rawText),
    conversation = await getConversation(supabase, row.phone_number),
    storedPendingData: Record<string, string> =
      conversation?.pending_data &&
      typeof conversation.pending_data === "object"
        ? conversation.pending_data
        : {};
  const pendingData = canReusePendingData(
    processingMode,
    storedPendingData[PENDING_WORKER_MODE_FIELD],
  )
    ? storedPendingData
    : {};
  const { data: history } = await supabase
    .from("whatsapp_messages")
    .select("message_body, received_at, message_type")
    .eq("phone_number", row.phone_number)
    .order("received_at", { ascending: false })
    .limit(8);
  const contextPendingData = { ...pendingData };
  delete contextPendingData[PENDING_WORKER_MODE_FIELD];
  const contextConversation = conversation
    ? { ...conversation, pending_data: contextPendingData }
    : conversation;
  const context = buildContext(contextConversation, (history || []).reverse());
  let finalReply: string | null = null,
    priority = 0;
  const patientReplies: string[] = [];
  // Duplicate-call guard: Evolution re-delivery can repeat an identical block
  // inside one payload. Memoize analyses per normalized block so each distinct
  // block is analyzed once (cross-invocation duplicates are
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
      // message_type (e.g. "image"). Any real text â€” including captions â€”
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
          analysis = await analyzeInboundBlock(
            processingMode,
            trimmed,
            conversation,
            () => analyzeMessage(
              trimmed,
              context,
              messageId,
              conversation,
              { env: providerEnv, log },
            ),
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
    analysis = brainGuard(trimmed, analysis, conversation);
    let intent = String(analysis.intent || "UNKNOWN").toUpperCase();
    if (analysis.isCancellationIntent) intent = "CANCELLATION";
    if (shouldHoldAuthorizationForClarification(processingMode, analysis)) {
      await updateConversation(supabase, row.phone_number, {
        active_intent: "INCOMPLETE_AUTHORIZATION",
      });
      finalReply =
        "I have not created an authorization request because the diagnosis or requested care is uncertain or lists alternatives. Please resend the request with one confirmed diagnosis and the exact treatment, procedures, investigations, and quantities. If these details are not confirmed, please have the clinical team clarify them first.\n\nâ€” Ronsberger HMO";
      priority = Math.max(priority, 3);
      continue;
    }
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
        "Your pending authorization draft has been cancelled. How else can I assist you? â€” Ronsberger HMO";
      priority = 4;
      continue;
    }
    const rawFields = extractAuthFieldsFromRaw(blockText);
    const phoneOnlyFollowup =
      intent === "PHONE_ONLY_FOLLOWUP" ||
      (Boolean(rawFields.patientPhone) &&
        !rawFields.patientName &&
        !rawFields.policyNumber &&
        (!rawFields.diagnosis || !rawFields.treatment) &&
        (!rawFields.procedure || !rawFields.investigation || !rawFields.requestedService));
    if (phoneOnlyFollowup) {
      finalReply =
        "Please resend the complete authorization request, including the patient name, NHIA / policy number, diagnosis, requested service, and patient phone number. This is required to safely match the information to the correct request.\n\nâ€” Ronsberger HMO";
      priority = Math.max(priority, 3);
      continue;
    }
    if (
      conversation?.active_intent === "INCOMPLETE_AUTHORIZATION" &&
      rawFields.patientPhone &&
      !rawFields.patientName &&
      !rawFields.policyNumber
    ) {
      finalReply =
        "To avoid mixing patient records, please resend the complete authorization request with the patient name, NHIA / policy number, diagnosis, requested service, and patient phone number.\n\nâ€” Ronsberger HMO";
      priority = Math.max(priority, 3);
      continue;
    }
    // â”€â”€ PROVIDER QUERIES (deterministic directory lookup) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
              `â€¢ ${p.name}${p.state ? ` â€” ${p.state}` : ""}${p.phone ? ` â€” ${p.phone}` : ""}`,
          )
          .join("\n");
        providerReply = `Here are Ronsberger HMO providers matching "${term}":\n\n${list}\n\nPlease contact the facility to confirm availability before visiting.\n\nâ€” Ronsberger HMO`;
      } else if (term) {
        providerReply = `I could not find a Ronsberger HMO provider matching "${term}" in our directory. Please tell me the type of service or another location and I will check again.\n\nâ€” Ronsberger HMO`;
      } else {
        providerReply =
          "Sure â€” I can look up Ronsberger HMO providers for you. Please tell me the type of service you need and/or your location (for example: 'hospitals in Ibadan').\n\nâ€” Ronsberger HMO";
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
          "Hello! Welcome to Ronsberger HMO Provider Authorization Portal.\n\nHow can I assist your hospital today? You can submit a patient authorization request or check request status anytime.";
      else if (intent === "HELP")
        reply =
          "Welcome to Ronsberger HMO Authorization Assistant.\n\nâ€¢ To submit an authorization: Send patient details (Name, NHIA/Policy No, Diagnosis, Treatment/Procedures, Hospital).\nâ€¢ To check status: Ask 'What is the status of [Patient Name]?'\nâ€¢ For providers: Ask e.g. 'Which hospitals can I use in Ibadan?'\n\nâ€” Ronsberger HMO";
      else if (
        intent === "GENERAL_CONVERSATION" &&
        analysis.conversationalReply?.trim()
      )
        reply = `${analysis.conversationalReply.trim()}\n\nâ€” Ronsberger HMO`;
      else if (intent === "NON_TEXT_MESSAGE")
        reply =
          "I can currently process medical authorization details sent as text. Please send the patient information as a text message.\n\nâ€” Ronsberger HMO";
      else
        reply =
          "Please send the patient details in this standard authorization format:\n\nFull Name\nNHIS/Policy number\nSex\nDate of birth\nPhone number\nConsultation\nDiagnosis\nProcedures/Treatment\nReferred to\nFrom University Health Service\n\nExample:\nFull Name: Jane Doe\nNHIS No: 1234567\nSex: Female\nDate of birth: 01 Jan 1990\nPhone no: +2348012345678\nConsultation: Initial consultation\nDiagnosis: Hypertension\nProcedures: Specialist Initial Consultation, Blood Pressure Review\nReferred to: UCH\nFrom University Health Service\n\nâ€” Ronsberger HMO";
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
              `â€¢ ${r.patient_name} â€” ${(r.status || "pending").toUpperCase()}`,
          )
          .join("\n");
        finalReply = `I found more than one authorization request from this number. Please provide the patient's full name or NHIA/NHIS number so I can check the correct one.\n\n${list}\n\nâ€” Ronsberger HMO`;
        priority = Math.max(priority, 2);
        continue;
      }
      if (!candidates.length) {
        finalReply =
          !name && !policy
            ? "I can check the status for you. Please provide the patient's name or NHIA/NHIS number so I can identify the request.\n\nâ€” Ronsberger HMO"
            : "I could not find an authorization request matching that patient or number from this WhatsApp number. Please check the name or NHIA/NHIS number and try again.\n\nâ€” Ronsberger HMO";
        priority = Math.max(priority, 2);
        continue;
      }
      const r: any = candidates[0];
      await supabase
        .from("whatsapp_messages")
        .update({
          authorization_request_id: r.id,
          status_updated_at: getNowIso(),
        })
        .eq("message_id", messageId);
      // Privacy: no internal database UUIDs or REQ- identifiers are exposed in customer WhatsApp messages.
      const status = String(r.status || "pending").toLowerCase();
      let reply = "";
      if (intent === "AUTHORIZATION_DETAILS")
        reply = `Authorization Details\n\nPatient: ${r.patient_name}\nNHIA/NHIS: ${r.policy_number || "Not specified"}\nDiagnosis: ${r.diagnosis || "Not specified"}\nTreatment/Services: ${r.treatment || "Not specified"}\nHospital: ${r.hospital_name || "Not specified"}\nStatus: ${status.toUpperCase()}\n\nâ€” Ronsberger HMO`;
      else if (status === "approved" || status === "referral_approved")
        reply = formatDetailedDecisionMessage(r, "approved");
      else if (status === "partially_approved")
        reply = formatDetailedDecisionMessage(r, "partially_approved");
      else if (status === "rejected")
        reply = formatDetailedDecisionMessage(r, "rejected");
      else
        reply = `AUTHORIZATION STATUS\n\nPatient: ${r.patient_name}\nPolicy No: ${r.policy_number || "N/A"}\nStatus: ${status.toUpperCase()}\n\nWe will notify you once a final decision is available.\n\nRonsberger HMO UI Desk`;
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
      const raw = rawFields,
        current = { ...pendingData },
        newName = raw.patientName || analysis.patientName,
        newPolicy = raw.policyNumber || analysis.policyNumber;
      if (draftIdentityConflicts(current, newName, newPolicy))
        Object.keys(current).forEach((k) => delete current[k]);
      const patientName = newName || current.patientName || null,
        policyNumber = newPolicy || current.policyNumber || null,
        patientPhone =
          raw.patientPhone ||
          analysis.patientPhone ||
          current.patientPhone ||
          null,
        diagnosis =
          raw.diagnosis || analysis.diagnosis || current.diagnosis || null,
        treatment =
          raw.treatment || analysis.treatment || current.treatment || null,
        procedure =
          raw.procedure || analysis.procedure || current.procedure || null,
        investigation =
          raw.investigation ||
          analysis.investigation ||
          current.investigation ||
          null,
        requestedService =
          raw.requestedService ||
          analysis.requestedService ||
          current.requestedService ||
          null,
        hospital =
          analysis.originatingHospital ||
          raw.originatingHospital ||
          current.originatingHospital ||
          "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)",
        referral =
          analysis.referralHospital || current.referralHospital || null,
        service = combineRequestedServices(
          treatment,
          procedure,
          investigation,
          requestedService,
        ),
        missing: string[] = [];
      if (!patientName) missing.push("Patient Name");
      if (!policyNumber) missing.push("NHIA / Policy Number");
      if (!diagnosis) missing.push("Diagnosis / Clinical Complaint");
      if (!service) missing.push("Requested Treatment, Procedure, or Service");
      if (!patientPhone) missing.push("Patient Phone");
      if (missing.length) {
        await updateConversation(supabase, row.phone_number, {
          pending_data: withWorkerModeOnPendingData({
            patientName,
            policyNumber,
            patientPhone,
            diagnosis,
            treatment,
            procedure,
            investigation,
            requestedService,
            originatingHospital: hospital,
            referralHospital: referral,
          }, processingMode),
          active_intent: "INCOMPLETE_AUTHORIZATION",
        });
        finalReply = `I have started your authorization request${patientName ? ` for ${patientName}` : ""}, but I still need:\n\n${missing.map((x) => `â€¢ ${x}`).join("\n")}\n\nPlease resend the full authorization request, including the missing details above, so we can complete it.\n\nâ€” Ronsberger HMO`;
        patientReplies.push(finalReply);
        priority = Math.max(priority, 3);
        continue;
      }
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const existing = await findSenderRequests(supabase, row.phone_number),
        // Family policies `1639554` / `1639554-1` / `1639554-2` share the same
        // base policy, so duplicate protection compares the BASE policy plus the
        // exact patient name. Different family members (different names) are
        // never merged; the same member resubmitted with or without a suffix is
        // caught.
        submittedPolicyBase = parsePolicyNumber(String(policyNumber || ""))
          .basePolicy.toLowerCase()
          .trim(),
        recentSamePatientPolicy = existing.filter(
          (r: any) =>
            r.created_at >= cutoff &&
            String(r.patient_name || "").toLowerCase() ===
              patientName!.toLowerCase() &&
            parsePolicyNumber(String(r.policy_number || "")).basePolicy
              .toLowerCase()
              .trim() === submittedPolicyBase,
        );
      const sameClinicalRequest = recentSamePatientPolicy.find((r: any) => {
        const existingDiagnosis = String(r.diagnosis || "").toLowerCase();
        const existingTreatment = String(r.treatment || "").toLowerCase();
        const currentDiagnosis = String(diagnosis || "").toLowerCase();
        const currentTreatment = String(service || "").toLowerCase();
        return (
          (!existingDiagnosis ||
            existingDiagnosis.includes(currentDiagnosis) ||
            currentDiagnosis.includes(existingDiagnosis)) &&
          (!existingTreatment ||
            existingTreatment.includes(currentTreatment) ||
            currentTreatment.includes(existingTreatment))
        );
      });
      if (sameClinicalRequest) {
        finalReply = `This looks like a duplicate authorization for ${patientName}.\n\nWe have not created a second active authorization for the same patient and policy in the recent period.\n\nIf this is a different diagnosis or treatment, please send the updated clinical details and we will queue it as a new request for review.\n\nâ€” Ronsberger HMO`;
        patientReplies.push(finalReply);
        await updateConversation(supabase, row.phone_number, {
          pending_data: {},
        });
        priority = Math.max(priority, 3);
        continue;
      }
      const relatedRequestId = recentSamePatientPolicy[0]?.id || null;
      const result = await postAuthorization(supabase, {
        source: "whatsapp",
        whatsapp_message_id: messageId,
        patient_name: patientName,
        policy_number: policyNumber,
        diagnosis,
        treatment: service,
        phone_number: patientPhone
          ? normalizePhoneNumber(patientPhone)
          : null,
        sender_phone: row.phone_number,
        hospital_name: hospital,
        referral_hospital_name: referral,
        urgency_level: analysis.urgencyLevel ?? 3,
        missing_info: processingMode === DETERMINISTIC_ONLY_WORKER_MODE
          ? [MANUAL_TARIFF_REVIEW_NOTE]
          : [],
        ...(processingMode === DETERMINISTIC_ONLY_WORKER_MODE
          ? { [WORKER_PROCESSING_MODE_FIELD]: processingMode }
          : {}),
        raw_message: blockText,
        related_request_id: relatedRequestId,
        duplicate_status: relatedRequestId ? "possible_revision" : "none",
      });
      if (result?.error === "phone_family_conflict") {
        await updateConversation(supabase, row.phone_number, {
          pending_data: {},
          active_intent: "COMPLETED",
        });
        finalReply =
          `âš ï¸ Request Not Submitted\n\n` +
          `The patient phone number provided has already been registered for a different family policy and therefore cannot be used for two different family policies.\n\n` +
          `Please check the patient's details and resubmit the request using the correct patient phone number.\n\n` +
          `If the patient does not have access to that number, please provide another valid phone number belonging to the patient or the patient's family.\n\n` +
          `If you believe the number has been incorrectly associated with another family, please contact Ronsberger HMO support for assistance.\n\n` +
          `No authorization request has been created.\n\nâ€” Ronsberger HMO`;
        patientReplies.push(finalReply);
        priority = Math.max(priority, 3);
        continue;
      }
      if (result?.error === "beneficiary_mismatch") {
        await updateConversation(supabase, row.phone_number, {
          pending_data: withWorkerModeOnPendingData({
            patientName,
            policyNumber,
            patientPhone,
            diagnosis,
            treatment: service,
            procedure,
            investigation,
            requestedService,
            originatingHospital: hospital,
            referralHospital: referral,
          }, processingMode),
          active_intent: "INCOMPLETE_AUTHORIZATION",
        });
        finalReply =
          `âš ï¸ NHIS/POLICY MATCH FAILED\n\n` +
          `The policy number belongs to the same family group, but the patient name supplied does not match the registered NHIS beneficiary record.\n\n` +
          `Please resend the exact patient name as it appears on the NHIS record, or confirm the correct policy number before submitting again.\n\n` +
          `No authorization request has been created.\n\nâ€” Ronsberger HMO`;
        patientReplies.push(finalReply);
        priority = Math.max(priority, 3);
        continue;
      }
      if (result?.error === "beneficiary_conflict") {
        await updateConversation(supabase, row.phone_number, {
          pending_data: withWorkerModeOnPendingData({
            patientName,
            policyNumber,
            patientPhone,
            diagnosis,
            treatment: service,
            procedure,
            investigation,
            requestedService,
            originatingHospital: hospital,
            referralHospital: referral,
          }, processingMode),
          active_intent: "INCOMPLETE_AUTHORIZATION",
        });
        finalReply =
          `âš ï¸ BENEFICIARY DETAILS CONFLICT\n\n` +
          `The beneficiary number does not match the patient name or family policy in the NHIS record. Please verify the member number and full name before resubmitting.\n\n` +
          `No authorization request has been created.\n\nâ€” Ronsberger HMO`;
        patientReplies.push(finalReply);
        priority = Math.max(priority, 3);
        continue;
      }
      if (result?.error === "beneficiary_ambiguous") {
        await updateConversation(supabase, row.phone_number, {
          pending_data: withWorkerModeOnPendingData({
            patientName,
            policyNumber,
            patientPhone,
            diagnosis,
            treatment: service,
            procedure,
            investigation,
            requestedService,
            originatingHospital: hospital,
            referralHospital: referral,
          }, processingMode),
          active_intent: "INCOMPLETE_AUTHORIZATION",
        });
        finalReply =
          `âš ï¸ NHIS MATCH IS AMBIGUOUS\n\n` +
          `The policy number and patient name could match more than one beneficiary in the NHIS record.\n\n` +
          `Please send the exact full patient name and confirm the correct family policy before trying again.\n\n` +
          `No authorization request has been created.\n\nâ€” Ronsberger HMO`;
        patientReplies.push(finalReply);
        priority = Math.max(priority, 3);
        continue;
      }

      const persistedAuthorization = result?.id
        ? await findExistingAuthorizationForMessage(supabase, {
          message_id: messageId,
          authorization_request_id: result.id,
        })
        : null;
      if (persistedAuthorization && isClinicallyDecidedAuthorization(persistedAuthorization)) {
        await supabase
          .from("whatsapp_messages")
          .update({
            authorization_request_id: persistedAuthorization.id,
            internal_request_id: persistedAuthorization.id,
            status: "authorization_created",
            status_updated_at: getNowIso(),
          })
          .eq("message_id", messageId);
        await updateConversation(supabase, row.phone_number, {
          pending_data: {},
          active_intent: "COMPLETED",
          last_patient_name: patientName,
          last_policy_number: policyNumber,
          active_authorization_id: persistedAuthorization.id,
        });
        await writeProcessingAudit(supabase, messageId, "authorization_replay_guard", "skipped", {
          reason: "authorization_decided_before_receipt_response",
          authorization_request_id: persistedAuthorization.id,
          authorization_status: persistedAuthorization.status || "unknown",
        });
        continue;
      }

      await supabase
        .from("whatsapp_messages")
        .update({
          authorization_request_id: result.id,
          internal_request_id: result.id,
          status: "authorization_created",
          status_updated_at: getNowIso(),
        })
        .eq("message_id", messageId);
      await updateConversation(supabase, row.phone_number, {
        pending_data: {},
        active_intent: "COMPLETED",
        last_patient_name: patientName,
        last_policy_number: policyNumber,
        active_authorization_id: result.id,
      });
      finalReply = relatedRequestId
        ? `Your updated medical authorization request for ${patientName} has been queued for review as a related request/revision.\n\nA prior authorization already exists for this patient and policy, and this new submission has been flagged for review instead of being silently merged.\n\nOur team will review it and update you here once a decision is available.\n\nâ€” Ronsberger HMO`
        : `Your medical authorization request for ${patientName} has been received successfully.\n\nOur team will review it and update you here once a decision is available.\n\nâ€” Ronsberger HMO`;
      patientReplies.push(finalReply);
      priority = Math.max(priority, 3);
      log("authorization", messageId, "ok", { request_id: result.request_id });
    }
  }
  if (finalReply) {
    const reply =
      blocks.length > 1 && patientReplies.length > 1
        ? patientReplies.join("\n\nâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n\n")
        : finalReply;
    await sendOutboundReply(
      supabase,
      row.phone_number,
      reply,
      row.message_id,
      row.authorization_request_id || null,
    );
  }
}
type WorkerRetryResult = { retryAfterMs?: number };

async function processOne(
  supabase: ReturnType<typeof getServiceClient>,
  messageId: string,
  processingMode: WorkerProcessingMode = AI_CAPABLE_WORKER_MODE,
): Promise<WorkerRetryResult> {
  const { data: row, error } = await supabase
    .from("whatsapp_messages")
    .select(
      "id, message_id, phone_number, message_type, message_body, attempts, status, raw_message, authorization_request_id, internal_request_id, status_updated_at, received_at, created_at, last_error, next_attempt_at",
    )
    .eq("message_id", messageId)
    .maybeSingle();
  if (error || !row) {
    log("load", messageId, "error", { error: error?.message });
    if (error) throw error;
    return {};
  }
  const currentStatus = normalizeStatus(row.status);
  if (!isInboundMessageProcessable(currentStatus)) return {};
  if (currentStatus === "retry" && row.next_attempt_at) {
    const nextAttemptMs = Date.parse(String(row.next_attempt_at));
    if (Number.isFinite(nextAttemptMs) && nextAttemptMs > Date.now()) {
      return { retryAfterMs: nextAttemptMs - Date.now() };
    }
  }

  const leaseOwner = getProcessingLeaseOwner();
  const { data: claimed, error: claimError } = await supabase
    .from("whatsapp_messages")
    .update({
      status: "processing",
      status_updated_at: getNowIso(),
      processing_owner: leaseOwner,
      processing_lease_expires_at: new Date(Date.now() + PROCESSING_LEASE_MS).toISOString(),
      processing_heartbeat_at: getNowIso(),
      attempts: (row.attempts || 0) + 1,
      next_attempt_at: getNowIso(),
    })
    .eq("message_id", messageId)
    .eq("status", currentStatus)
    .select("message_id");
  if (claimError || !claimed?.length) {
    if (claimError) {
      log("claim", messageId, "error", { error: claimError.message });
      throw claimError;
    }
    return { retryAfterMs: PROCESSING_LEASE_MS };
  }

  try {
    await touchProcessingLease(supabase, messageId, leaseOwner, PROCESSING_LEASE_MS);

    const existingAuthorization = await resumeExistingAuthorization(supabase, row);
    if (existingAuthorization) {
      const linkResult = await supabase
        .from("whatsapp_messages")
        .update({
          authorization_request_id: existingAuthorization.id,
          internal_request_id: existingAuthorization.id,
          last_error: null,
        })
        .eq("message_id", messageId)
        .eq("processing_owner", leaseOwner)
        .select("message_id")
        .maybeSingle();
      if (linkResult.error) throw linkResult.error;
      if (!linkResult.data?.message_id) throw new Error("processing lease lost");

      if (isClinicallyDecidedAuthorization(existingAuthorization)) {
        await writeProcessingAudit(supabase, messageId, "authorization_replay_guard", "skipped", {
          reason: "authorization_already_decided",
          authorization_request_id: existingAuthorization.id,
          authorization_status: existingAuthorization.status || "unknown",
        });
        await setMessageStatus(supabase, messageId, "completed", {
          authorization_request_id: existingAuthorization.id,
          internal_request_id: existingAuthorization.id,
          last_error: null,
        }, leaseOwner);
        return {};
      }

      if (String(existingAuthorization.source || "").toLowerCase() === "whatsapp") {
        await ensureArrivalPin(supabase, existingAuthorization.id);
      }

      // Refresh the decision before any replay response. This avoids sending
      // a pending acknowledgement after a concurrent approval or decline.
      const latestAuthorization = await findExistingAuthorizationForMessage(supabase, {
        message_id: messageId,
        authorization_request_id: existingAuthorization.id,
      });
      if (!latestAuthorization) throw new Error("existing_authorization_disappeared");
      if (isClinicallyDecidedAuthorization(latestAuthorization)) {
        await writeProcessingAudit(supabase, messageId, "authorization_replay_guard", "skipped", {
          reason: "authorization_decided_before_replay_response",
          authorization_request_id: latestAuthorization.id,
          authorization_status: latestAuthorization.status || "unknown",
        });
        await setMessageStatus(supabase, messageId, "completed", {
          authorization_request_id: latestAuthorization.id,
          internal_request_id: latestAuthorization.id,
          last_error: null,
        }, leaseOwner);
        return {};
      }

      const messageIsOld = isPastAutoProcessAgeLimit(
        row,
        MAX_AUTO_PROCESS_AGE_MINUTES,
      );
      const ledger = await getOutboundLedger(supabase, messageId);
      const canSendResponse = !ledger || shouldSendOutbound(
        ledger.outbound_state,
        ledger.lease_expires_at,
      );
      if (messageIsOld || !canSendResponse) {
        await writeProcessingAudit(supabase, messageId, "authorization_replay_guard", "skipped", {
          reason: messageIsOld ? "old_message_existing_request" : "outbound_already_recorded_or_uncertain",
          authorization_request_id: latestAuthorization.id,
          authorization_status: latestAuthorization.status || "unknown",
          message_age_ms: getMessageAgeMs(row),
          outbound_state: ledger?.outbound_state || "not_started",
        });
        await setMessageStatus(supabase, messageId, "completed", {
          authorization_request_id: latestAuthorization.id,
          internal_request_id: latestAuthorization.id,
          last_error: null,
        }, leaseOwner);
        return {};
      }

      await writeProcessingAudit(supabase, messageId, "authorization_replay_guard", "ok", {
        reason: "existing_request_reused_without_new_authorization",
        authorization_request_id: latestAuthorization.id,
        authorization_status: latestAuthorization.status || "unknown",
      });
      const replayReply =
        "An authorization request is already linked to this WhatsApp message. No duplicate request was created. Our team will send the decision update in this chat.\n\nâ€” Ronsberger HMO";
      const outbound = await sendOutboundReply(
        supabase,
        row.phone_number,
        replayReply,
        messageId,
        latestAuthorization.id,
      );
      await setMessageStatus(supabase, messageId, "completed", {
        authorization_request_id: latestAuthorization.id,
        internal_request_id: latestAuthorization.id,
        last_error: outbound.ambiguous
          ? "Existing authorization is preserved; outbound delivery is uncertain."
          : null,
        template_sent_at: outbound.ambiguous ? null : getNowIso(),
      }, leaseOwner);
      return {};
    }

    // Verify the sender before a stale-message response or any request work.
    const sender = await resolveHospitalSender(supabase, row.phone_number);
    if (!sender.authorized && sender.reason === "identity_lookup_failed") {
      throw new Error("identity_lookup_failed");
    }
    if (!sender.authorized) {
      if (sender.reason === "unregistered_sender") {
        const cutoff = new Date(Date.now() - UNREGISTERED_WINDOW_MS).toISOString();
        const { count, error: countError } = await supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("phone_number", row.phone_number)
          .gte("received_at", cutoff);
        if (countError) throw countError;

        if ((count || 0) > UNREGISTERED_MAX_MESSAGES) {
          log("rate_limit", messageId, "skipped", { reason: "unregistered_sender_rate_limit" });
          await setMessageStatus(supabase, messageId, "failed", {
            last_error: "Rate limited unregistered sender",
          }, leaseOwner);
          return {};
        }
      }
      log("auth_guard", messageId, "skipped", { reason: sender.reason });
      await setMessageStatus(supabase, messageId, "failed", {
        last_error: `Dropped by auth guard: ${sender.reason}`,
      }, leaseOwner);
      return {};
    }

    if (isPastAutoProcessAgeLimit(row, MAX_AUTO_PROCESS_AGE_MINUTES)) {
      const ageMs = getMessageAgeMs(row);
      await writeProcessingAudit(supabase, messageId, "stale_message_hold", "skipped", {
        reason: "outside_automatic_processing_window",
        age_limit_minutes: MAX_AUTO_PROCESS_AGE_MINUTES,
        message_age_ms: ageMs,
      });
      const ledger = await getOutboundLedger(supabase, messageId);
      const canSendHoldNotice = !ledger || shouldSendOutbound(
        ledger.outbound_state,
        ledger.lease_expires_at,
      );
      let deliveryUncertain = Boolean(ledger && isOutboundAmbiguous(
        ledger.outbound_state,
        ledger.lease_expires_at,
      ));
      if (canSendHoldNotice) {
        const holdNotice =
          "We could not safely process this older authorization message automatically. No new authorization request was created. If the request is still needed, please resend it as a new message.\n\nâ€” Ronsberger HMO";
        const outbound = await sendOutboundReply(
          supabase,
          row.phone_number,
          holdNotice,
          messageId,
          null,
          "stale_message_hold",
        );
        deliveryUncertain = outbound.ambiguous;
      }
      await setMessageStatus(supabase, messageId, "stale", {
        last_error: deliveryUncertain
          ? "Message held safely; delivery of the hold notice is uncertain."
          : null,
      }, leaseOwner);
      return {};
    }

    await processMessageBody(supabase, {
      ...row,
      authorization_request_id: row.authorization_request_id || null,
      internal_request_id: row.internal_request_id || null,
    }, processingMode);
    const outboundLedger = await getOutboundLedger(supabase, messageId);
    if (outboundLedger?.outbound_state === "ambiguous") {
      await setMessageStatus(supabase, messageId, "response_pending", {
        last_error: "Outbound delivery is ambiguous and requires controlled reconciliation",
      }, leaseOwner);
      return {};
    }
    await setMessageStatus(supabase, messageId, "completed", {
      last_error: null,
      processed_at: getNowIso(),
      template_sent_at: getNowIso(),
    }, leaseOwner);
  } catch (e) {
    const msg = (e as Error).message || "unknown";
    log("process", messageId, "error", { error: msg });
    const classification = classifyRetryFailure(msg);
    if (classification.kind === "failed") {
      await setMessageStatus(supabase, messageId, "failed", {
        last_error: msg.slice(0, 500),
      }, leaseOwner);
      return {};
    }
    if (Number(row.attempts || 0) + 1 >= MAX_ATTEMPTS) {
      await setMessageStatus(supabase, messageId, "failed", {
        last_error: `Maximum retry attempts reached: ${msg.slice(0, 400)}`,
      }, leaseOwner);
      return {};
    }
    const retryAfterMs = classification.delayMs;
    await setMessageStatus(supabase, messageId, "retry", {
      next_attempt_at: new Date(Date.now() + retryAfterMs).toISOString(),
      last_error: msg.slice(0, 500),
    }, leaseOwner);
    return { retryAfterMs };
  }

  return {};
}
async function pollAndProcess(
  supabase: ReturnType<typeof getServiceClient>,
  processingMode: WorkerProcessingMode = AI_CAPABLE_WORKER_MODE,
): Promise<{ ok: true; inbound_poll: "processed" | "deferred"; detail?: string }> {
  // Decision notices have their own durable outbox. Drain it before polling
  // inbound submissions so an inbound query failure cannot block a decision.
  await processNotifications(supabase);

  try {
    await recoverStaleProcessingRows(supabase);
    const now = new Date();
    const nowIso = now.toISOString();
    const ageCutoff = new Date(now.getTime() - MAX_AUTO_PROCESS_AGE_MINUTES * 60_000).toISOString();
    const [freshResult, retryResult, staleResult] = await Promise.all([
      supabase
        .from("whatsapp_messages")
        .select("message_id,status,received_at,created_at,next_attempt_at")
        .in("status", ["received", "queued"])
        .gte("received_at", ageCutoff)
        .order("received_at", { ascending: true })
        .limit(WORKER_BATCH),
      supabase
        .from("whatsapp_messages")
        .select("message_id,status,received_at,created_at,next_attempt_at")
        .eq("status", "retry")
        .gte("received_at", ageCutoff)
        .lte("next_attempt_at", nowIso)
        .order("next_attempt_at", { ascending: true })
        .limit(WORKER_BATCH),
      supabase
        .from("whatsapp_messages")
        .select("message_id,status,received_at,created_at,next_attempt_at")
        .in("status", ["received", "queued", "retry"])
        .lt("received_at", ageCutoff)
        .or(`status.neq.retry,next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
        .order("received_at", { ascending: true })
        .limit(WORKER_BATCH),
    ]);
    if (freshResult.error) {
      throw new Error(`whatsapp_poll_fresh_select_failed: ${freshResult.error.message}`);
    }
    if (retryResult.error) {
      throw new Error(`whatsapp_poll_retry_select_failed: ${retryResult.error.message}`);
    }
    if (staleResult.error) {
      throw new Error(`whatsapp_poll_stale_select_failed: ${staleResult.error.message}`);
    }

    // Separate indexed scans keep the oldest retry backlog from hiding newly
    // received requests. Old items get only the remaining batch slots and are
    // held by processOne without creating an authorization.
    const queuePlan = getQueuePlan(
      [...(freshResult.data || []), ...(retryResult.data || [])],
      WORKER_BATCH,
      now,
    );
    const selected = new Set(queuePlan.map((row) => row.message_id));
    const stalePlan = getStaleQueueCandidates(
      staleResult.data || [],
      Math.max(0, WORKER_BATCH - queuePlan.length),
    ).filter((row) => !selected.has(row.message_id));

    for (const row of queuePlan) await processOne(supabase, row.message_id, processingMode);
    for (const row of stalePlan) await processOne(supabase, row.message_id, processingMode);
    return { ok: true, inbound_poll: "processed" };
  } catch (error) {
    const record = error && typeof error === "object"
      ? error as { code?: unknown; message?: unknown }
      : null;
    const detail = (error instanceof Error
      ? error.message
      : [record?.code, record?.message]
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .join(": ") || "unknown error")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 300);
    log("inbound_poll", "worker", "error", { detail });
    return { ok: true, inbound_poll: "deferred", detail };
  }
}
serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("authorization") || "",
    bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "",
    serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    workerSecret = req.headers.get("x-worker-secret") || "";
  const isAuthorized =
    (Boolean(serviceKey) && constantTimeEqual(bearer, serviceKey)) ||
    (Boolean(WORKER_SECRET) && constantTimeEqual(workerSecret, WORKER_SECRET));
  if (!isAuthorized)
    return new Response("forbidden", { status: 403 });
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const processingMode = resolveWorkerProcessingMode(
    req.headers.get(WORKER_PROCESSING_MODE_HEADER),
  );

  const supabase = getServiceClient();
  let responseBody: Record<string, unknown> = { ok: true };
  try {
    if (body?.authorization_request_id) {
      const authorizationRequestId = String(body.authorization_request_id).trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authorizationRequestId)) {
        return new Response(JSON.stringify({ error: "invalid_authorization_request_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      responseBody = {
        ok: true,
        ...await processNotifications(supabase, authorizationRequestId),
      };
    } else if (body?.message_id) {
      responseBody = {
        ok: true,
        ...await processOne(supabase, String(body.message_id), processingMode),
      };
    } else {
      responseBody = await pollAndProcess(supabase, processingMode);
    }
  } catch (error) {
    // Return only the top-level operational error to the private worker caller.
    // Poll query failures otherwise become an opaque Edge Runtime 500.
    const structuredError = error && typeof error === "object"
      ? error as { code?: unknown; message?: unknown }
      : null;
    const errorParts = [structuredError?.code, structuredError?.message]
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    const detail = (error instanceof Error
      ? error.message
      : errorParts.join(": ") || "unknown error")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 300);
    log("worker_invocation", "request", "error", { detail });
    return new Response(JSON.stringify({ error: "worker_invocation_failed", detail }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
