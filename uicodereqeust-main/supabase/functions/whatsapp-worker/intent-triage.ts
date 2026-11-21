// supabase/functions/whatsapp-worker/intent-triage.ts
// Inbound message triage and conversational intent processing engine.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildContext,
  brainGuard,
  deriveProviderSearchTerm,
  deterministicFallbackAnalysis,
  extractAuthFieldsFromRaw,
  combineRequestedServices,
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
  type ProviderEnvironment,
} from "./providers.ts";
import {
  sendOutboundReply,
  formatDetailedDecisionMessage,
} from "./response-dispatcher.ts";
import {
  draftIdentityConflicts,
  findExistingAuthorizationForMessage,
  findSenderRequests,
  getConversation,
  getProviderInformation,
  postAuthorization,
  updateConversation,
} from "./authorizations-intake.ts";
import {
  AI_CAPABLE_WORKER_MODE,
  DETERMINISTIC_ONLY_WORKER_MODE,
  MANUAL_TARIFF_REVIEW_NOTE,
  PENDING_WORKER_MODE_FIELD,
  WORKER_PROCESSING_MODE_FIELD,
  canReusePendingData,
  withWorkerModeOnPendingData,
  type WorkerProcessingMode,
} from "../_shared/whatsapp-worker-mode.ts";
import { isClinicallyDecidedAuthorization } from "../_shared/authorization-state.ts";

export type InboundMessageRow = {
  message_id: string;
  phone_number: string;
  message_type: string;
  message_body: string | null;
  authorization_request_id?: string | null;
  internal_request_id?: string | null;
};

export type IntentTriageOptions = {
  env?: ProviderEnvironment;
  log?: (
    stage: string,
    message_id: string,
    status: "ok" | "error" | "skipped",
    detail?: unknown,
  ) => void;
  writeAudit?: (
    supabase: any,
    messageId: string,
    stage: string,
    status: "ok" | "error" | "skipped",
    detail: Record<string, unknown>,
  ) => Promise<void>;
};

export function getNowIso() {
  return new Date().toISOString();
}

export async function writeProcessingAudit(
  supabase: any,
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

const defaultProviderEnv: ProviderEnvironment = {
  geminiApiKey: Deno.env.get("GEMINI_API_KEY") || "",
  geminiModel: Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash",
  groqApiKey: Deno.env.get("GROQ_API_KEY") || "",
  groqModel: Deno.env.get("GROQ_MODEL") || "",
  modalEndpoint: Deno.env.get("MODAL_ENDPOINT") || "",
  modalWebhookSecret: Deno.env.get("MODAL_WEBHOOK_SECRET") || "",
  geminiTimeoutMs: Number(Deno.env.get("GEMINI_TIMEOUT_MS") || "10000") || 10000,
  groqTimeoutMs: Number(Deno.env.get("GROQ_TIMEOUT_MS") || "10000") || 10000,
  modalTimeoutMs: Number(Deno.env.get("MODAL_TIMEOUT_MS") || "10000") || 10000,
};

function defaultLog(
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
}

export async function processMessageBody(
  supabase: any,
  row: InboundMessageRow,
  processingMode: WorkerProcessingMode = AI_CAPABLE_WORKER_MODE,
  options?: IntentTriageOptions,
) {
  const log = options?.log ?? defaultLog;
  const providerEnv = options?.env ?? defaultProviderEnv;
  const writeProcessingAuditFn = options?.writeAudit ?? writeProcessingAudit;
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
        await writeProcessingAuditFn(supabase, messageId, "authorization_replay_guard", "skipped", {
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

