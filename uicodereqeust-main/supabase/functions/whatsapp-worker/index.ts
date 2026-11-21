// whatsapp-worker/index.ts
// Ronsberger HMO WhatsApp AI conversation worker.
// AI interprets intent and entities; deterministic code owns database/business actions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { quotePostgrestFilterValue } from "../_shared/postgrest-filter.ts";
import {
  sendWhatsAppMessage,
  getOutboundLedger,
  saveOutboundLedger,
  sendOutboundReply,
  formatPatientDecisionMessage,
} from "./response-dispatcher.ts";
import {
  findExistingAuthorizationForMessage,
  resolveHospitalSender,
  resumeExistingAuthorization,
} from "./authorizations-intake.ts";
import {
  processMessageBody,
  writeProcessingAudit,
  getNowIso,
} from "./intent-triage.ts";
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
  WORKER_PROCESSING_MODE_FIELD,
  WORKER_PROCESSING_MODE_HEADER,
  resolveWorkerProcessingMode,
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

    await processMessageBody(
      supabase,
      {
        ...row,
        authorization_request_id: row.authorization_request_id || null,
        internal_request_id: row.internal_request_id || null,
      },
      processingMode,
      { env: providerEnv, log, writeAudit: writeProcessingAudit },
    );
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
