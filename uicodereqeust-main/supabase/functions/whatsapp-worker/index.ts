// whatsapp-worker/index.ts
// Ronsberger HMO WhatsApp AI conversation worker.
// AI interprets intent and entities; deterministic code owns database/business actions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
  analyzeMessage,
  type GeminiAnalysisResult,
} from "./providers.ts";
import {
  classifyRetryFailure,
  getWorkerBatchSize,
  getQueuePlan,
  getStaleQueueCandidates,
  isOutboundAmbiguous,
  normalizeStatus,
  shouldSendOutbound,
} from "./queue-hardening.ts";
import {
  getMessageAgeMs,
  isClinicallyDecidedAuthorization,
  isPastAutoProcessAgeLimit,
  parseAutoProcessAgeLimitMinutes,
} from "../_shared/authorization-state.ts";
import { ensureArrivalPin } from "../_shared/arrival-pin.ts";
import { schedulePendingAuthorizationPush } from "../_shared/pending-auth-push.ts";

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
    .then(() => {})
    .catch(() => {});
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
    next.next_attempt_at = null;
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

async function findExistingAuthorizationForMessage(
  supabase: ReturnType<typeof getServiceClient>,
  row: {
    message_id: string;
    authorization_request_id?: string | null;
    internal_request_id?: string | null;
    received_at?: string | null;
    created_at?: string | null;
  },
) {
  const candidateIds = [
    row.authorization_request_id,
    row.internal_request_id,
  ].filter((value): value is string => Boolean(value));

  if (candidateIds.length) {
    const { data, error } = await supabase
      .from("authorization_requests")
      .select(
        "id, request_id, patient_name, policy_number, diagnosis, treatment, status, source, clinical_notes, whatsapp_message_id, authorization_code, approved_by, decided_at, decided_by, decision_reason, created_at",
      )
      .in("id", candidateIds)
      .limit(20);
    if (error) throw error;
    if (data?.[0]) return data[0];
  }

  const messageId = String(row.message_id || "").trim();
  if (messageId) {
    const { data: directMatch, error: directMatchError } = await supabase
      .from("authorization_requests")
      .select(
        "id, request_id, patient_name, policy_number, diagnosis, treatment, status, source, clinical_notes, whatsapp_message_id, authorization_code, approved_by, decided_at, decided_by, decision_reason, created_at",
      )
      .eq("whatsapp_message_id", messageId)
      .limit(20);
    if (directMatchError) throw directMatchError;
    if (directMatch?.[0]) return directMatch[0];
  }

  // The JSON-note lookup exists only for legacy rows that predate the indexed
  // whatsapp_message_id column. Avoid reading a page of recent authorizations
  // for every normal inbound message.
  if (!isPastAutoProcessAgeLimit(row, MAX_AUTO_PROCESS_AGE_MINUTES)) return null;

  const { data: recent, error: recentError } = await supabase
    .from("authorization_requests")
    .select(
      "id, request_id, patient_name, policy_number, diagnosis, treatment, status, source, clinical_notes, whatsapp_message_id, authorization_code, approved_by, decided_at, decided_by, decision_reason, created_at",
    )
    .eq("source", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(200);
  if (recentError) throw recentError;

  const matching = (recent || []).find((candidate) => {
    let clinical: Record<string, unknown> = candidate.clinical_notes && typeof candidate.clinical_notes === "object"
      ? candidate.clinical_notes as Record<string, unknown>
      : {};
    if (typeof candidate.clinical_notes === "string") {
      try {
        const parsed: unknown = JSON.parse(candidate.clinical_notes);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          clinical = parsed as Record<string, unknown>;
        }
      } catch { clinical = {}; }
    }
    const exactMessageId = String(candidate.whatsapp_message_id || "");
    const noteMessageId = String(clinical.whatsapp_message_id || "");
    return exactMessageId === String(row.message_id) || noteMessageId === String(row.message_id);
  });

  return matching || null;
}

async function resumeExistingAuthorization(
  supabase: ReturnType<typeof getServiceClient>,
  row: {
    message_id: string;
    authorization_request_id?: string | null;
    internal_request_id?: string | null;
    received_at?: string | null;
    created_at?: string | null;
  },
) {
  return await findExistingAuthorizationForMessage(supabase, row);
}

function normalizeDraftName(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function draftIdentityConflicts(
  current: Record<string, string>,
  incomingName: string | null,
  incomingPolicy: string | null,
) {
  const currentName = normalizeDraftName(current.patientName);
  const newName = normalizeDraftName(incomingName);
  if (currentName && newName && currentName !== newName) return true;

  const currentPolicy = parsePolicyNumber(String(current.policyNumber || "")).basePolicy;
  const newPolicy = parsePolicyNumber(String(incomingPolicy || "")).basePolicy;
  return Boolean(currentPolicy && newPolicy && currentPolicy !== newPolicy);
}

async function sendWhatsAppMessage(toPhone: string, text: string) {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY)
    throw new Error("Evolution creds missing");
  if (OUTBOUND_DELAY_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, OUTBOUND_DELAY_MS));
  }
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE_NAME)}`;
  let res: Response;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    OUTBOUND_REQUEST_TIMEOUT_MS,
  );
  try {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number: toPhone, text }),
        signal: controller.signal,
      });
      await res.text();
    } catch (cause) {
      const error = new Error(`Evolution delivery outcome is uncertain: ${(cause as Error).message || "network error"}`);
      Object.assign(error, { deliveryAmbiguous: true });
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    // Do not persist the provider response body: it can contain recipient
    // identifiers. The HTTP status is enough to classify retry behavior.
    const error = new Error(`Evolution send ${res.status}`);
    Object.assign(error, { providerStatus: res.status });
    if (res.status >= 500) Object.assign(error, { deliveryAmbiguous: true });
    throw error;
  }
  return body;
}

async function getOutboundLedger(
  supabase: ReturnType<typeof getServiceClient>,
  messageId: string,
) {
  const { data, error } = await supabase
    .from("whatsapp_outbound_ledger")
    .select(    "id, message_id, status, outbound_state, provider_message_id, authorization_request_id, sent_at, attempt_count, lease_owner, lease_expires_at, last_error, operation_key, destination_phone, content_hash")
    .eq("message_id", messageId)
    .maybeSingle();
  if (error) {
    log("outbound_ledger", messageId, "error", { error: error.message });
    throw new Error(`outbound_ledger_lookup_failed: ${error.message}`);
  }
  return data || null;
}

async function saveOutboundLedger(
  supabase: ReturnType<typeof getServiceClient>,
  messageId: string,
  authorizationRequestId: string | null,
  status: "pending" | "sent" | "failed" | "retrying" | "ambiguous",
  extra: Record<string, unknown> = {},
) {
  const payload: Record<string, unknown> = {
    message_id: messageId,
    authorization_request_id: authorizationRequestId || null,
    status,
    outbound_state: extra.outbound_state || (status === "sent" ? "sent" : status === "failed" ? "send_failed" : status === "retrying" ? "retry_pending" : "not_started"),
    updated_at: new Date().toISOString(),
    attempt_count: Number(extra.attempt_count ?? 0),
    ...extra,
  };
  if (status === "sent") payload.sent_at = payload.sent_at || new Date().toISOString();
  if (payload.outbound_state === "send_in_progress") {
    payload.lease_expires_at = payload.lease_expires_at || new Date(Date.now() + 120_000).toISOString();
  } else {
    payload.lease_expires_at = null;
  }
  const { error } = await supabase
    .from("whatsapp_outbound_ledger")
    .upsert(payload, { onConflict: "message_id" });
  if (error) throw error;
  return payload;
}

async function sendOutboundReply(
  supabase: ReturnType<typeof getServiceClient>,
  toPhone: string,
  text: string,
  messageId: string,
  authorizationRequestId?: string | null,
  operationKey = "authorization_response",
) {
  const ledger = await getOutboundLedger(supabase, messageId);
  if (ledger && isOutboundAmbiguous(ledger.outbound_state, ledger.lease_expires_at)) {
    if (ledger.outbound_state !== "ambiguous") {
      await saveOutboundLedger(supabase, messageId, authorizationRequestId || null, "retrying", {
        outbound_state: "ambiguous",
        attempt_count: Number(ledger.attempt_count || 0),
        last_error: "Outbound lease expired; provider delivery cannot be reconciled safely",
        lease_expires_at: null,
      });
    }
    return { skipped: true, ambiguous: true, providerMessageId: ledger.provider_message_id || null };
  }
  if (ledger && !shouldSendOutbound(ledger.outbound_state, ledger.lease_expires_at)) {
    return { skipped: true, ambiguous: false, providerMessageId: ledger.provider_message_id || null };
  }
  const attemptNumber = Number(ledger?.attempt_count || 0) + 1;
  const contentHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
  ).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const leaseOwner = `outbound-${crypto.randomUUID()}`;
  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_whatsapp_outbound_operation",
    {
      p_message_id: messageId,
      p_authorization_request_id: authorizationRequestId || null,
      p_operation_key: operationKey,
      p_destination_phone: toPhone,
      p_content_hash: contentHash,
      p_lease_owner: leaseOwner,
      p_lease_seconds: 120,
    },
  );
  if (claimError) throw claimError;
  if (!claimed) {
    return { skipped: true, ambiguous: true, providerMessageId: ledger?.provider_message_id || null };
  }

  let providerMessageId: unknown;
  try {
    providerMessageId = await sendWhatsAppMessage(toPhone, text);
  } catch (error) {
    const msg = (error as Error).message || "unknown";
    const deliveryAmbiguous = Boolean((error as Error & { deliveryAmbiguous?: boolean }).deliveryAmbiguous);
    const { error: updateError } = await supabase
      .from("whatsapp_outbound_ledger")
      .update({
      outbound_state: deliveryAmbiguous ? "ambiguous" : "send_failed",
      status: deliveryAmbiguous ? "retrying" : "failed",
      attempt_count: attemptNumber,
      last_error: msg.slice(0, 500),
      lease_expires_at: null,
      lease_owner: null,
      updated_at: new Date().toISOString(),
      })
      .eq("message_id", messageId)
      .eq("lease_owner", leaseOwner);
    if (updateError) throw updateError;
    if (deliveryAmbiguous) {
      return { skipped: true, ambiguous: true, providerMessageId: null };
    }
    throw error;
  }

  try {
    const { error: updateError } = await supabase
      .from("whatsapp_outbound_ledger")
      .update({
      outbound_state: "sent",
      status: "sent",
      provider_message_id: typeof providerMessageId === "string" ? providerMessageId.slice(0, 200) : null,
      sent_at: new Date().toISOString(),
      attempt_count: attemptNumber,
      last_error: null,
      lease_expires_at: null,
      lease_owner: null,
      updated_at: new Date().toISOString(),
      })
      .eq("message_id", messageId)
      .eq("lease_owner", leaseOwner);
    if (updateError) throw updateError;
    return { skipped: false, ambiguous: false, providerMessageId: providerMessageId || null };
  } catch (error) {
    const msg = (error as Error).message || "provider succeeded but result persistence failed";
    try {
      await supabase
        .from("whatsapp_outbound_ledger")
        .update({
        status: "retrying",
        outbound_state: "ambiguous",
        provider_message_id: typeof providerMessageId === "string" ? providerMessageId.slice(0, 200) : null,
        attempt_count: attemptNumber,
        last_error: `Evolution accepted the message but persistence failed: ${msg.slice(0, 400)}`,
        lease_expires_at: null,
        lease_owner: null,
        updated_at: new Date().toISOString(),
        })
        .eq("message_id", messageId)
        .eq("lease_owner", leaseOwner);
    } catch (ambiguityError) {
      log("outbound_ledger", messageId, "error", {
        error: (ambiguityError as Error).message,
        provider_result: "accepted",
      });
    }
    return { skipped: true, ambiguous: true, providerMessageId: providerMessageId || null };
  }
}

async function resolveHospitalSender(
  supabase: ReturnType<typeof getServiceClient>,
  phoneNumber: string,
) {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) return { authorized: false, reason: "phone_required" };

  const { data, error } = await supabase
    .from("hospital_whatsapp_contacts")
    .select("id, hospital_id, contact_name, contact_role, phone_number, status")
    .eq("status", "active")
    .limit(500);

  if (error) {
    return { authorized: false, reason: "identity_lookup_failed" };
  }

  const matches = (data || []).filter(
    (row: any) => normalizePhoneNumber(String(row.phone_number || "")) === normalized,
  );
  const hospitals = [...new Set(matches.map((row: any) => String(row.hospital_id)).filter(Boolean))];
  if (hospitals.length !== 1) {
    return {
      authorized: false,
      reason: hospitals.length > 1 ? "ambiguous_sender" : "unregistered_sender",
    };
  }

  return { authorized: true, hospitalId: hospitals[0] };
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
    if (!res.ok) {
      let failure: any = null;
      try {
        failure = await res.json();
      } catch {
        failure = null;
      }
      const failureMessage = String(
        failure?.code || failure?.message || "",
      ).toLowerCase();
      if (
        failureMessage === "phone_family_conflict" ||
        failure?.message === "phone_family_conflict"
      ) {
        return {
          error: "phone_family_conflict",
          message: String(
            failure?.message ||
              "This phone number is already associated with another policy family.",
          ),
        };
      }
      if (
        failureMessage === "beneficiary_mismatch" ||
        failure?.message === "beneficiary_mismatch"
      ) {
        return {
          error: "beneficiary_mismatch",
          message: String(
            failure?.message ||
              "The patient name does not match the NHIS beneficiary record for this policy family.",
          ),
        };
      }
      if (
        failureMessage === "beneficiary_ambiguous" ||
        failure?.message === "beneficiary_ambiguous"
      ) {
        return {
          error: "beneficiary_ambiguous",
          message: String(
            failure?.message ||
              "More than one NHIS beneficiary matches this patient name and policy family.",
          ),
        };
      }
    }
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
    whatsappMessageId = String(payload.whatsapp_message_id || ""),
    relatedRequestId = payload.related_request_id
      ? String(payload.related_request_id)
      : null,
    duplicateStatus = payload.duplicate_status
      ? String(payload.duplicate_status)
      : "none";
  let hospitalId: string | null = null;
  const { data: senderContact } = await supabase
    .from("hospital_whatsapp_contacts")
    .select("hospital_id")
    .eq("phone_number", normalizePhoneNumber(String(payload.sender_phone || "")))
    .eq("status", "active")
    .maybeSingle();
  if (senderContact?.hospital_id) {
    hospitalId = senderContact.hospital_id;
  }
  const normalizedPhoneNumber = phoneNumber
    ? normalizePhoneNumber(phoneNumber)
    : null;
  const phoneCheck = await supabase.rpc("register_policy_phone", {
    p_phone: normalizedPhoneNumber,
    p_family_policy: policyNumber,
  });
  if (phoneCheck.error) throw phoneCheck.error;
  if (!phoneCheck.data?.allowed) {
    return {
      error: "phone_family_conflict",
      message: String(
        phoneCheck.data?.reason ||
          "Request not submitted: this patient phone number is already registered for a different family policy. No authorization request has been created.",
      ),
    };
  }
  const existingAuth = whatsappMessageId
    ? await findExistingAuthorizationForMessage(supabase, { message_id: whatsappMessageId })
    : null;
  if (existingAuth) {
    if (whatsappMessageId) {
      await supabase
        .from("whatsapp_messages")
        .update({
          authorization_request_id: existingAuth.id,
          internal_request_id: existingAuth.id,
          status: "authorization_created",
          status_updated_at: getNowIso(),
          last_error: null,
        })
        .eq("message_id", whatsappMessageId);
    }
    if (
      String(payload.source || "").toLowerCase() === "whatsapp" &&
      !isClinicallyDecidedAuthorization(existingAuth)
    ) {
      await ensureArrivalPin(supabase, existingAuth.id);
    }
    return {
      id: String(existingAuth.id),
      request_id: existingAuth.request_id ? String(existingAuth.request_id) : undefined,
      status: existingAuth.status ? String(existingAuth.status) : undefined,
    };
  }
  const { data: row, error } = await supabase
    .from("authorization_requests")
    .insert({
      patient_name: patientName,
      policy_number: policyNumber,
      diagnosis,
      treatment,
      patient_phone: normalizedPhoneNumber,
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
        related_request_id: relatedRequestId,
        duplicate_status: duplicateStatus,
      }),
      whatsapp_message_id: whatsappMessageId || null,
      whatsapp_raw_message: whatsappMessageId,
      status: "pending",
      submitted_by: null,
      related_request_id: relatedRequestId,
      duplicate_status: duplicateStatus,
    })
    .select("id, request_id, status")
    .single();
  if (error) {
    const { data: existing } = whatsappMessageId
      ? await supabase
        .from("authorization_requests")
        .select("id, request_id, status, authorization_code, approved_by, decided_at, decided_by, decision_reason")
        .eq("whatsapp_message_id", whatsappMessageId)
        .maybeSingle()
      : { data: null };
    if (existing) {
      if (
        String(payload.source || "").toLowerCase() === "whatsapp" &&
        !isClinicallyDecidedAuthorization(existing)
      ) {
        await ensureArrivalPin(supabase, existing.id);
      }
      return { id: existing.id, request_id: existing.request_id, status: existing.status };
    }
  }
  if (error || !row)
    throw new Error(
      `Direct DB fallback failed: ${error?.message || "unknown"}`,
    );
  if (String(payload.source || "").toLowerCase() === "whatsapp") {
    if (row.status === "pending") {
      schedulePendingAuthorizationPush(supabase, row.id, hospitalName);
    }
    await ensureArrivalPin(supabase, row.id);
  }
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
      "id, request_id, patient_name, policy_number, status, decision_reason, diagnosis, treatment, hospital_name, claiming_hospital_name, authorization_code, approved_items, decided_at, created_at",
    )
    .in("id", ids)
    .order("created_at", { ascending: false })
    .limit(20);
  return data || [];
}

function formatDetailedDecisionMessage(
  auth: any,
  decision: "approved" | "partially_approved" | "rejected",
): string {
  if (decision === "rejected") {
    return `AUTHORIZATION DECLINED\n\nPatient: ${auth.patient_name}\nPolicy No: ${auth.policy_number || "N/A"}\nHospital: ${auth.claiming_hospital_name || auth.hospital_name || "N/A"}\nDiagnosis: ${auth.diagnosis || "Not specified"}\nReason: ${auth.decision_reason || "Does not meet clinical policy guidelines"}\nDate: ${auth.decided_at ? new Date(auth.decided_at).toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB")}\n\nPlease contact Ronsberger HMO for clarification before treatment.\n\nRonsberger HMO UI Desk`;
  }

  const items = Array.isArray(auth.approved_items) ? auth.approved_items : [];
  const approved = items
    .filter((item: any) => !item?.declined)
    .map(
      (item: any) =>
        `${item?.code || "NHIA"} - ${item?.name || "Approved service"}: ${Number(item?.quantity || 1)}`,
    )
    .join("\n") || `• ${auth.treatment || "See the authorization record"}`;
  const declined = items
    .filter((item: any) => item?.declined)
    .map((item: any) => {
      const line = `${item?.code || "NHIA"} - ${item?.name || "Declined service"}: ${Number(item?.quantity || 1)}`;
      return `~${line}~${item?.decline_reason ? ` (Reason: ${item.decline_reason})` : ""}`;
    })
    .join("\n");
  const isPartial = decision === "partially_approved";
  const date = auth.decided_at
    ? new Date(auth.decided_at).toLocaleDateString("en-GB")
    : new Date().toLocaleDateString("en-GB");
  const closing = isPartial
    ? "Please proceed only with the approved services listed above. Declined services must not be provided under this authorization. For clarification, please contact Ronsberger HMO before treatment."
    : "Please proceed with the approved services listed above. For clarification, please contact Ronsberger HMO before treatment.";
  return `${isPartial ? "AUTHORIZATION PARTIALLY APPROVED" : "AUTHORIZATION APPROVED"}\n\nPatient: ${auth.patient_name}\nPolicy No: ${auth.policy_number || "N/A"}\nAuth Code: ${auth.authorization_code || "N/A"}\nHospital: ${auth.claiming_hospital_name || auth.hospital_name || "N/A"}\nDiagnosis: ${auth.diagnosis || "Not specified"}\n\nApproved Services:\n${approved}${declined ? `\n\nDeclined Services:\n${declined}` : ""}\nDate: ${date}\n\n${closing}\n\nRonsberger HMO UI Desk`;
}

function formatPatientDecisionMessage(
  auth: any,
  decision: "approved" | "partially_approved" | "rejected",
): string {
  const isPartial = decision === "partially_approved";
  const heading = decision === "rejected"
    ? "AUTHORIZATION DECLINED"
    : isPartial
    ? "AUTHORIZATION PARTIALLY APPROVED"
    : "AUTHORIZATION APPROVED";
  const approved = (Array.isArray(auth.approved_items) ? auth.approved_items : [])
    .filter((item: any) => !item?.declined)
    .map((item: any) => `- ${item?.code || "NHIA"} - ${item?.name || "Approved service"}: ${Number(item?.quantity || 1)}`)
    .join("\n") || auth.treatment || "See the authorization details provided by your hospital.";
  const declined = (Array.isArray(auth.approved_items) ? auth.approved_items : [])
    .filter((item: any) => item?.declined)
    .map((item: any) => `- ${item?.code || "NHIA"} - ${item?.name || "Service"}: ${Number(item?.quantity || 1)}${item?.decline_reason ? ` (${item.decline_reason})` : ""}`)
    .join("\n");
  const date = auth.decided_at
    ? new Date(auth.decided_at).toLocaleDateString("en-GB")
    : new Date().toLocaleDateString("en-GB");

  if (decision === "rejected") {
    return `Ronsberger HMO\n\n${heading}\n\nPatient: ${auth.patient_name}\nPolicy No: ${auth.policy_number || "N/A"}\nDiagnosis: ${auth.diagnosis || "Not specified"}\nReason: ${auth.decision_reason || "Please contact your hospital or Ronsberger HMO for clarification."}\n\nDate: ${date}\n\nPlease contact your hospital or Ronsberger HMO if you have any questions.`;
  }

  return `Ronsberger HMO\n\n${heading}\n\nPatient: ${auth.patient_name}\nPolicy No: ${auth.policy_number || "N/A"}\nAuth Code: ${auth.authorization_code || "N/A"}\nHospital: ${auth.claiming_hospital_name || auth.hospital_name || "N/A"}\nDiagnosis: ${auth.diagnosis || "Not specified"}\n\nApproved Services:\n${approved}${declined ? `\n\nNot Approved:\n${declined}` : ""}\n\nDate: ${date}\n\n${isPartial ? "Please proceed only with the approved services listed above. Do not receive declined services under this authorization." : "Please contact your hospital or Ronsberger HMO if you have any questions."}\n\nRonsberger HMO`;
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
    authorization_request_id?: string | null;
    internal_request_id?: string | null;
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
  const patientReplies: string[] = [];
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
    analysis = brainGuard(trimmed, analysis, conversation);
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
        "Please resend the complete authorization request, including the patient name, NHIA / policy number, diagnosis, requested service, and patient phone number. This is required to safely match the information to the correct request.\n\n— Ronsberger HMO";
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
        "To avoid mixing patient records, please resend the complete authorization request with the patient name, NHIA / policy number, diagnosis, requested service, and patient phone number.\n\n— Ronsberger HMO";
      priority = Math.max(priority, 3);
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
          "Hello! Welcome to Ronsberger HMO Provider Authorization Portal.\n\nHow can I assist your hospital today? You can submit a patient authorization request or check request status anytime.";
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
          "Please send the patient details in this standard authorization format:\n\nFull Name\nNHIS/Policy number\nSex\nDate of birth\nPhone number\nConsultation\nDiagnosis\nProcedures/Treatment\nReferred to\nFrom University Health Service\n\nExample:\nFull Name: Jane Doe\nNHIS No: 1234567\nSex: Female\nDate of birth: 01 Jan 1990\nPhone no: +2348012345678\nConsultation: Initial consultation\nDiagnosis: Hypertension\nProcedures: Specialist Initial Consultation, Blood Pressure Review\nReferred to: UCH\nFrom University Health Service\n\n— Ronsberger HMO";
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
        .update({
          authorization_request_id: r.id,
          status_updated_at: getNowIso(),
        })
        .eq("message_id", messageId);
      // Privacy: no internal database UUIDs or REQ- identifiers are exposed in customer WhatsApp messages.
      const status = String(r.status || "pending").toLowerCase();
      let reply = "";
      if (intent === "AUTHORIZATION_DETAILS")
        reply = `Authorization Details\n\nPatient: ${r.patient_name}\nNHIA/NHIS: ${r.policy_number || "Not specified"}\nDiagnosis: ${r.diagnosis || "Not specified"}\nTreatment/Services: ${r.treatment || "Not specified"}\nHospital: ${r.hospital_name || "Not specified"}\nStatus: ${status.toUpperCase()}\n\n— Ronsberger HMO`;
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
          pending_data: {
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
          },
          active_intent: "INCOMPLETE_AUTHORIZATION",
        });
        finalReply = `I have started your authorization request${patientName ? ` for ${patientName}` : ""}, but I still need:\n\n${missing.map((x) => `• ${x}`).join("\n")}\n\nPlease resend the full authorization request, including the missing details above, so we can complete it.\n\n— Ronsberger HMO`;
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
        finalReply = `This looks like a duplicate authorization for ${patientName}.\n\nWe have not created a second active authorization for the same patient and policy in the recent period.\n\nIf this is a different diagnosis or treatment, please send the updated clinical details and we will queue it as a new request for review.\n\n— Ronsberger HMO`;
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
        missing_info: [],
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
          `⚠️ Request Not Submitted\n\n` +
          `The patient phone number provided has already been registered for a different family policy and therefore cannot be used for two different family policies.\n\n` +
          `Please check the patient's details and resubmit the request using the correct patient phone number.\n\n` +
          `If the patient does not have access to that number, please provide another valid phone number belonging to the patient or the patient's family.\n\n` +
          `If you believe the number has been incorrectly associated with another family, please contact Ronsberger HMO support for assistance.\n\n` +
          `No authorization request has been created.\n\n— Ronsberger HMO`;
        patientReplies.push(finalReply);
        priority = Math.max(priority, 3);
        continue;
      }
      if (result?.error === "beneficiary_mismatch") {
        await updateConversation(supabase, row.phone_number, {
          pending_data: {
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
          },
          active_intent: "INCOMPLETE_AUTHORIZATION",
        });
        finalReply =
          `⚠️ NHIS/POLICY MATCH FAILED\n\n` +
          `The policy number belongs to the same family group, but the patient name supplied does not match the registered NHIS beneficiary record.\n\n` +
          `Please resend the exact patient name as it appears on the NHIS record, or confirm the correct policy number before submitting again.\n\n` +
          `No authorization request has been created.\n\n— Ronsberger HMO`;
        patientReplies.push(finalReply);
        priority = Math.max(priority, 3);
        continue;
      }
      if (result?.error === "beneficiary_ambiguous") {
        await updateConversation(supabase, row.phone_number, {
          pending_data: {
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
          },
          active_intent: "INCOMPLETE_AUTHORIZATION",
        });
        finalReply =
          `⚠️ NHIS MATCH IS AMBIGUOUS\n\n` +
          `The policy number and patient name could match more than one beneficiary in the NHIS record.\n\n` +
          `Please send the exact full patient name and confirm the correct family policy before trying again.\n\n` +
          `No authorization request has been created.\n\n— Ronsberger HMO`;
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
        ? `Your updated medical authorization request for ${patientName} has been queued for review as a related request/revision.\n\nA prior authorization already exists for this patient and policy, and this new submission has been flagged for review instead of being silently merged.\n\nOur team will review it and update you here once a decision is available.\n\n— Ronsberger HMO`
        : `Your medical authorization request for ${patientName} has been received successfully.\n\nOur team will review it and update you here once a decision is available.\n\n— Ronsberger HMO`;
      patientReplies.push(finalReply);
      priority = Math.max(priority, 3);
      log("authorization", messageId, "ok", { request_id: result.request_id });
    }
  }
  if (finalReply) {
    const reply =
      blocks.length > 1 && patientReplies.length > 1
        ? patientReplies.join("\n\n────────────────\n\n")
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
async function processOne(
  supabase: ReturnType<typeof getServiceClient>,
  messageId: string,
) {
  const { data: row, error } = await supabase
    .from("whatsapp_messages")
    .select(
      "id, message_id, phone_number, message_type, message_body, attempts, status, raw_message, authorization_request_id, internal_request_id, status_updated_at, received_at, created_at, last_error, next_attempt_at",
    )
    .eq("message_id", messageId)
    .maybeSingle();
  if (error || !row) {
    log("load", messageId, "error", { error: error?.message });
    return;
  }
  const currentStatus = normalizeStatus(row.status);
  if (["completed", "failed", "stale"].includes(currentStatus)) return;
  if (!["queued", "retry", "received"].includes(currentStatus)) return;
  if (currentStatus === "retry" && row.next_attempt_at) {
    const nextAttemptMs = Date.parse(String(row.next_attempt_at));
    if (Number.isFinite(nextAttemptMs) && nextAttemptMs > Date.now()) return;
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
    if (claimError)
      log("claim", messageId, "error", { error: claimError.message });
    return;
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
        return;
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
        return;
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
        return;
      }

      await writeProcessingAudit(supabase, messageId, "authorization_replay_guard", "ok", {
        reason: "existing_request_reused_without_new_authorization",
        authorization_request_id: latestAuthorization.id,
        authorization_status: latestAuthorization.status || "unknown",
      });
      const replayReply =
        "An authorization request is already linked to this WhatsApp message. No duplicate request was created. Our team will send the decision update in this chat.\n\n— Ronsberger HMO";
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
      return;
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
            next_attempt_at: getNowIso(),
          }, leaseOwner);
          return;
        }
      }
      log("auth_guard", messageId, "skipped", { reason: sender.reason });
      await setMessageStatus(supabase, messageId, "failed", {
        last_error: `Dropped by auth guard: ${sender.reason}`,
        next_attempt_at: getNowIso(),
      }, leaseOwner);
      return;
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
          "We could not safely process this older authorization message automatically. No new authorization request was created. If the request is still needed, please resend it as a new message.\n\n— Ronsberger HMO";
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
      return;
    }

    await processMessageBody(supabase, {
      ...row,
      authorization_request_id: row.authorization_request_id || null,
      internal_request_id: row.internal_request_id || null,
    });
    const outboundLedger = await getOutboundLedger(supabase, messageId);
    if (outboundLedger?.outbound_state === "ambiguous") {
      await setMessageStatus(supabase, messageId, "response_pending", {
        last_error: "Outbound delivery is ambiguous and requires controlled reconciliation",
      }, leaseOwner);
      return;
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
        next_attempt_at: getNowIso(),
      }, leaseOwner);
      return;
    }
    if (Number(row.attempts || 0) + 1 >= MAX_ATTEMPTS) {
      await setMessageStatus(supabase, messageId, "failed", {
        last_error: `Maximum retry attempts reached: ${msg.slice(0, 400)}`,
        next_attempt_at: getNowIso(),
      }, leaseOwner);
      return;
    }
    await setMessageStatus(supabase, messageId, "retry", {
      next_attempt_at: new Date(Date.now() + classification.delayMs).toISOString(),
      last_error: msg.slice(0, 500),
    }, leaseOwner);
  }
}
async function processNotifications(
  supabase: ReturnType<typeof getServiceClient>,
  authorizationRequestId?: string,
) {
  let notificationQuery = supabase
    .from("whatsapp_notifications")
    .select("*")
    .in("status", ["queued_v2", "retry_v2"])
    .or(`attempts.lt.${MAX_ATTEMPTS},attempts.is.null`)
    .order("created_at", { ascending: true })
    .limit(WORKER_BATCH);
  if (authorizationRequestId) {
    notificationQuery = notificationQuery.eq("authorization_request_id", authorizationRequestId);
  }
  const { data: notes, error: notesError } = await notificationQuery;
  if (notesError) {
    throw new Error(`decision_outbox_select_failed: ${notesError.message}`);
  }

  for (const candidate of notes || []) {
    const leaseOwner = `decision-${crypto.randomUUID()}`;
    const { data: claimedRows, error: claimError } = await supabase.rpc(
      "claim_whatsapp_decision_notification",
      {
        p_notification_id: candidate.id,
        p_lease_owner: leaseOwner,
        p_lease_seconds: 180,
      },
    );
    if (claimError) {
      log("decision_notification_claim", String(candidate.id), "error", {
        error: claimError.message,
      });
      continue;
    }
    const note = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
    if (!note) continue;

    try {
      const { data: auth, error: authError } = await supabase
        .from("authorization_requests")
        .select("id,patient_name,patient_phone,policy_number,authorization_code,hospital_name,claiming_hospital_name,requesting_hospital_id,hospital_id,diagnosis,status,decision_reason,approved_items,treatment,decided_at")
        .eq("id", note.authorization_request_id)
        .maybeSingle();
      if (authError) throw authError;
      if (!auth) {
        await supabase
          .from("whatsapp_notifications")
          .update({
            status: "superseded",
            last_error: "Authorization request no longer exists.",
            processing_lease_owner: null,
            processing_lease_expires_at: null,
          })
          .eq("id", note.id)
          .eq("processing_lease_owner", leaseOwner);
        continue;
      }

      const expectedStatus =
        note.notification_type === "APPROVAL"
          ? ["approved", "referral_approved"]
          : note.notification_type === "PARTIAL_APPROVAL"
            ? ["partially_approved"]
            : note.notification_type === "REJECTION"
              ? ["rejected"]
              : [];
      const sameDecision = !note.decision_at ||
        Date.parse(String(note.decision_at)) === Date.parse(String(auth.decided_at || ""));
      if (!sameDecision || !expectedStatus.includes(String(auth.status || "").toLowerCase())) {
        await supabase
          .from("whatsapp_notifications")
          .update({
            status: "superseded",
            last_error: `Superseded decision notification ignored (current status: ${auth.status}).`,
            processing_lease_owner: null,
            processing_lease_expires_at: null,
          })
          .eq("id", note.id)
          .eq("processing_lease_owner", leaseOwner);
        continue;
      }

      const decision = note.notification_type === "APPROVAL"
        ? "approved"
        : note.notification_type === "PARTIAL_APPROVAL"
        ? "partially_approved"
        : "rejected";
      let recipient = normalizePhoneNumber(String(note.phone_number || ""));
      if (note.recipient_type === "patient") {
        recipient = normalizePhoneNumber(String(auth.patient_phone || recipient));
        if (!recipient && auth.policy_number) {
          const { data: patient, error: patientError } = await supabase
            .from("patients")
            .select("phone_number")
            .eq("policy_number", auth.policy_number)
            .maybeSingle();
          if (patientError) throw patientError;
          recipient = normalizePhoneNumber(String(patient?.phone_number || ""));
        }
      } else {
        const { data: senderRows, error: senderError } = await supabase
          .from("whatsapp_messages")
          .select("phone_number")
          .eq("authorization_request_id", auth.id)
          .order("received_at", { ascending: true })
          .limit(1);
        if (senderError) throw senderError;
        recipient = normalizePhoneNumber(String(senderRows?.[0]?.phone_number || recipient));

        const hospitalId = auth.requesting_hospital_id || auth.hospital_id;
        if (!recipient && hospitalId) {
          const { data: contact, error: contactError } = await supabase
            .from("hospital_whatsapp_contacts")
            .select("phone_number")
            .eq("hospital_id", hospitalId)
            .eq("status", "active")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (contactError) throw contactError;
          recipient = normalizePhoneNumber(String(contact?.phone_number || ""));
        }
        if (!recipient && hospitalId) {
          const { data: hospital, error: hospitalError } = await supabase
            .from("hospitals")
            .select("phone")
            .eq("id", hospitalId)
            .maybeSingle();
          if (hospitalError) throw hospitalError;
          recipient = normalizePhoneNumber(String(hospital?.phone || ""));
        }
      }

      if (!recipient) {
        await supabase
          .from("whatsapp_notifications")
          .update({
            status: "failed_v2",
            last_error: `No ${note.recipient_type} phone is available for this decision.`,
            processing_lease_owner: null,
            processing_lease_expires_at: null,
          })
          .eq("id", note.id)
          .eq("processing_lease_owner", leaseOwner);
        continue;
      }

      const body = note.recipient_type === "patient"
        ? formatPatientDecisionMessage(auth, decision)
        : formatDetailedDecisionMessage(auth, decision);
      const operationKey = `authorization_decision_${note.recipient_type}`;
      const delivery = await sendOutboundReply(
        supabase,
        recipient,
        body,
        `decision-notification:${auth.id}:${note.decision_at}:${note.recipient_type}`,
        auth.id,
        operationKey,
      );
      const nextState = delivery.ambiguous ? "ambiguous_v2" : "sent_v2";
      const { error: updateError } = await supabase
        .from("whatsapp_notifications")
        .update({
          status: nextState,
          sent_at: delivery.ambiguous ? null : new Date().toISOString(),
          last_error: delivery.ambiguous
            ? "Provider delivery is uncertain; automatic resend was stopped to prevent a duplicate. Reconcile before retrying."
            : null,
          processing_lease_owner: null,
          processing_lease_expires_at: null,
        })
        .eq("id", note.id)
        .eq("processing_lease_owner", leaseOwner);
      if (updateError) throw updateError;
    } catch (e) {
      const attempts = Number(note.attempts || 0);
      const classification = classifyRetryFailure(e);
      const { error: updateError } = await supabase
        .from("whatsapp_notifications")
        .update({
          status: attempts >= MAX_ATTEMPTS || classification.kind === "failed"
            ? "failed_v2"
            : "retry_v2",
          last_error: ((e as Error).message || "Notification delivery failed.").slice(0, 500),
          processing_lease_owner: null,
          processing_lease_expires_at: null,
        })
        .eq("id", note.id)
        .eq("processing_lease_owner", leaseOwner);
      if (updateError) {
        log("decision_notification_state", String(note.id), "error", {
          error: updateError.message,
        });
      }
    }
  }
}

async function pollAndProcess(
  supabase: ReturnType<typeof getServiceClient>,
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

    for (const row of queuePlan) await processOne(supabase, row.message_id);
    for (const row of stalePlan) await processOne(supabase, row.message_id);
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
  } catch {
    body = {};
  }
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
      await processNotifications(supabase, authorizationRequestId);
    } else if (body?.message_id) {
      await processOne(supabase, String(body.message_id));
    } else {
      responseBody = await pollAndProcess(supabase);
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
