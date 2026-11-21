// supabase/functions/whatsapp-worker/notification-dispatcher.ts
// Outbox processor for clinical decision notifications to hospitals and enrollees.

import {
  sendOutboundReply,
  formatDetailedDecisionMessage,
  formatPatientDecisionMessage,
} from "./response-dispatcher.ts";
import { classifyRetryFailure } from "./queue-hardening.ts";
import { ensureArrivalPin } from "../_shared/arrival-pin.ts";
import { getDecisionNotificationIdempotency } from "../_shared/whatsapp-notification-idempotency.ts";
import { normalizePhoneNumber } from "./brain.ts";

const MAX_ATTEMPTS = 5;
const WORKER_BATCH = 10;

export interface WorkerRetryResult {
  retryAfterMs?: number;
}

export async function processNotifications(
  supabase: any,
  authorizationRequestId?: string,
): Promise<WorkerRetryResult> {
  let retryAfterMs = 0;
  const recoveryCheckAt = new Date().toISOString();
  let notificationQuery = supabase
    .from("whatsapp_notifications")
    .select("*")
    .or(
      `and(status.in.(queued_v2,retry_v2),or(attempts.lt.${MAX_ATTEMPTS},attempts.is.null)),` +
        `and(status.eq.processing_v2,or(processing_lease_expires_at.is.null,processing_lease_expires_at.lt.${recoveryCheckAt}))`,
    )
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
    if (
      candidate.status === "processing_v2" &&
      Number(candidate.attempts || 0) >= MAX_ATTEMPTS
    ) {
      const { error: terminalizeError } = await supabase
        .from("whatsapp_notifications")
        .update({
          status: "failed_v2",
          last_error: "Worker attempt limit reached after an expired processing lease.",
          processing_lease_owner: null,
          processing_lease_expires_at: null,
        })
        .eq("id", candidate.id)
        .eq("status", "processing_v2")
        .gte("attempts", MAX_ATTEMPTS)
        .or(
          `processing_lease_expires_at.is.null,processing_lease_expires_at.lt.${recoveryCheckAt}`,
        );
      if (terminalizeError) throw terminalizeError;
      continue;
    }

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
      console.log(JSON.stringify({
        stage: "decision_notification_claim",
        message_id: String(candidate.id),
        status: "error",
        error: claimError.message,
      }));
      throw claimError;
    }
    const note = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
    if (!note) continue;

    try {
      const { data: auth, error: authError } = await supabase
        .from("authorization_requests")
        .select(
          "id, request_id, patient_name, policy_number, status, decision_reason, diagnosis, treatment, hospital_name, claiming_hospital_name, authorization_code, approved_items, decided_at, patient_phone, source",
        )
        .eq("id", note.authorization_request_id)
        .single();
      if (authError || !auth) {
        throw new Error(
          `Authorization ${note.authorization_request_id} not found: ${authError?.message || "missing row"}`,
        );
      }

      const decision = String(auth.status);
      if (
        !["approved", "partially_approved", "rejected"].includes(decision)
      ) {
        await supabase
          .from("whatsapp_notifications")
          .update({
            status: "failed_v2",
            last_error: `Unexpected decision status: ${decision}`,
            processing_lease_owner: null,
            processing_lease_expires_at: null,
          })
          .eq("id", note.id)
          .eq("processing_lease_owner", leaseOwner);
        continue;
      }

      const isPatientNotice = note.recipient_type === "patient";
      const messageText = isPatientNotice
        ? formatPatientDecisionMessage(auth, decision as any)
        : formatDetailedDecisionMessage(auth, decision as any);

      const resolvedRecipientPhone = normalizePhoneNumber(note.recipient_phone);
      if (!resolvedRecipientPhone) {
        await supabase
          .from("whatsapp_notifications")
          .update({
            status: "failed_v2",
            last_error: `Invalid or missing recipient phone: ${note.recipient_phone}`,
            processing_lease_owner: null,
            processing_lease_expires_at: null,
          })
          .eq("id", note.id)
          .eq("processing_lease_owner", leaseOwner);
        continue;
      }

      const operationKey = getDecisionNotificationIdempotency({
        authorizationRequestId: auth.id,
        recipientPhone: resolvedRecipientPhone,
        recipientType: note.recipient_type,
        decision,
        decidedAt: auth.decided_at,
        authorizationCode: auth.authorization_code,
      }).operationKey;

      const replyResult = await sendOutboundReply(
        supabase,
        resolvedRecipientPhone,
        messageText,
        `notification-${note.id}`,
        auth.id,
        operationKey,
      );

      if (replyResult?.ambiguous) {
        await supabase
          .from("whatsapp_notifications")
          .update({
            status: "retry_v2",
            last_error: "Evolution delivery outcome uncertain; retrying idempotently.",
            processing_lease_owner: null,
            processing_lease_expires_at: null,
          })
          .eq("id", note.id)
          .eq("processing_lease_owner", leaseOwner);
        continue;
      }

      await supabase
        .from("whatsapp_notifications")
        .update({
          status: "sent_v2",
          sent_at: new Date().toISOString(),
          last_error: null,
          processing_lease_owner: null,
          processing_lease_expires_at: null,
        })
        .eq("id", note.id)
        .eq("processing_lease_owner", leaseOwner);

      if (decision === "approved" || decision === "partially_approved") {
        await ensureArrivalPin(supabase, auth.id);
      }
    } catch (e) {
      const classification = classifyRetryFailure(e, Number(note.attempts || 0));
      const exhausted = Number(note.attempts || 0) >= MAX_ATTEMPTS;
      const { error: updateError } = await supabase
        .from("whatsapp_notifications")
        .update({
          status: exhausted || classification.kind === "failed"
            ? "failed_v2"
            : "retry_v2",
          last_error: ((e as Error).message || "Notification delivery failed.").slice(0, 500),
          processing_lease_owner: null,
          processing_lease_expires_at: null,
        })
        .eq("id", note.id)
        .eq("processing_lease_owner", leaseOwner);
      if (updateError) {
        console.log(JSON.stringify({
          stage: "decision_notification_state",
          message_id: String(note.id),
          status: "error",
          error: updateError.message,
        }));
        throw updateError;
      }
      if (!exhausted && classification.kind === "retry") {
        retryAfterMs = Math.max(retryAfterMs, classification.delayMs);
      }
    }
  }

  return retryAfterMs > 0 ? { retryAfterMs } : {};
}
