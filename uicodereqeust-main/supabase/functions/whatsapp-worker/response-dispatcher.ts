// supabase/functions/whatsapp-worker/response-dispatcher.ts
// Outbound Evolution API message dispatching, ledger tracking, and decision formatting.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isOutboundAmbiguous,
  shouldSendOutbound,
} from "./queue-hardening.ts";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const EVOLUTION_INSTANCE_NAME =
  Deno.env.get("EVOLUTION_INSTANCE_NAME") || "medicode-wa";
const OUTBOUND_DELAY_MS = Number(Deno.env.get("OUTBOUND_DELAY_MS") || 0);
const OUTBOUND_REQUEST_TIMEOUT_MS = Number(
  Deno.env.get("OUTBOUND_REQUEST_TIMEOUT_MS") || 15_000,
);

export async function sendWhatsAppMessage(toPhone: string, text: string): Promise<null> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    throw new Error("Evolution creds missing");
  }
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
    const error = new Error(`Evolution send ${res.status}`);
    Object.assign(error, { providerStatus: res.status });
    if (res.status >= 500) Object.assign(error, { deliveryAmbiguous: true });
    throw error;
  }
  return null;
}

export async function getOutboundLedger(
  supabase: any,
  messageId: string,
) {
  const { data, error } = await supabase
    .from("whatsapp_outbound_ledger")
    .select("id, message_id, status, outbound_state, provider_message_id, authorization_request_id, sent_at, attempt_count, lease_owner, lease_expires_at, last_error, operation_key, destination_phone, content_hash")
    .eq("message_id", messageId)
    .maybeSingle();
  if (error) {
    console.log(JSON.stringify({ stage: "outbound_ledger", message_id: messageId, status: "error", error: error.message }));
    throw new Error(`outbound_ledger_lookup_failed: ${error.message}`);
  }
  return data || null;
}

export async function saveOutboundLedger(
  supabase: any,
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

export async function sendOutboundReply(
  supabase: any,
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
      console.log(JSON.stringify({
        stage: "outbound_ledger",
        message_id: messageId,
        status: "error",
        error: (ambiguityError as Error).message,
        provider_result: "accepted",
      }));
    }
    return { skipped: true, ambiguous: true, providerMessageId: providerMessageId || null };
  }
}

export function formatDetailedDecisionMessage(
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

export function formatPatientDecisionMessage(
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
