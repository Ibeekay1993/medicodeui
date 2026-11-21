// supabase/functions/whatsapp-worker/authorizations-intake.ts
// Handles hospital contact resolution, conversation state tracking, directory searches, and authorization request persistence.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { quotePostgrestFilterValue } from "../_shared/postgrest-filter.ts";
import { normalizePhoneNumber, parsePolicyNumber } from "./brain.ts";
import { parseWhatsAppHospitalContactResolution } from "../_shared/whatsapp-hospital-contact.ts";
import { isPastAutoProcessAgeLimit, isClinicallyDecidedAuthorization } from "../_shared/authorization-state.ts";
import { ensureArrivalPin } from "../_shared/arrival-pin.ts";
import { schedulePendingAuthorizationPush } from "../_shared/pending-auth-push.ts";
import {
  WORKER_PROCESSING_MODE_FIELD,
  getClinicalReviewNote,
  resolveWorkerProcessingMode,
} from "../_shared/whatsapp-worker-mode.ts";

const MEDAUTH_BASE_URL =
  Deno.env.get("MEDAUTH_INTERNAL_BASE_URL") ||
  Deno.env.get("SUPABASE_URL") ||
  "";
const MEDAUTH_INTERNAL_PATH =
  Deno.env.get("MEDAUTH_INTERNAL_PATH") || "/functions/v1/submit-authorization";
const MEDAUTH_API_KEY = Deno.env.get("MEDAUTH_INTERNAL_API_KEY") || "";
const WORKER_SECRET = Deno.env.get("WORKER_SECRET") || "";
const MAX_AUTO_PROCESS_AGE_MINUTES = 60;

export function normalizeDraftName(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export function draftIdentityConflicts(
  current: Record<string, string>,
  incomingName: string | null | undefined,
  incomingPolicy: string | null | undefined,
): boolean {
  const currentName = normalizeDraftName(current.patientName);
  const newName = normalizeDraftName(incomingName);
  if (currentName && newName && currentName !== newName) return true;

  const currentPolicy = parsePolicyNumber(String(current.policyNumber || "")).basePolicy;
  const newPolicy = parsePolicyNumber(String(incomingPolicy || "")).basePolicy;
  return Boolean(currentPolicy && newPolicy && currentPolicy !== newPolicy);
}

export async function resolveHospitalSender(
  supabase: any,
  phoneNumber: string,
) {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) return { authorized: false, reason: "phone_required" };

  const { data, error } = await supabase.rpc("resolve_whatsapp_hospital_contact", {
    _phone: normalized,
  });
  return parseWhatsAppHospitalContactResolution(data, error);
}

export async function findExistingAuthorizationForMessage(
  supabase: any,
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

  const matching = (recent || []).find((candidate: any) => {
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

export async function resumeExistingAuthorization(
  supabase: any,
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

export async function getConversation(
  supabase: any,
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

export async function updateConversation(
  supabase: any,
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

export async function findSenderRequests(
  supabase: any,
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

export async function getProviderInformation(
  supabase: any,
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
  if (term) {
    const pattern = quotePostgrestFilterValue(`%${term.slice(0, 120)}%`);
    query = query.or(`name.ilike.${pattern},state.ilike.${pattern}`);
  }
  const { data, error } = await query;
  if (error) {
    console.log(JSON.stringify({ stage: "provider_lookup", message_id: messageId, status: "error", error: error.message }));
    return null;
  }
  return data || [];
}

export async function postAuthorization(
  supabase: any,
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
        failureMessage === "beneficiary_conflict" ||
        failure?.message === "beneficiary_conflict"
      ) {
        return {
          error: "beneficiary_conflict",
          message: "The beneficiary number conflicts with the patient name or policy. Please verify the member details before resubmitting.",
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
          status_updated_at: new Date().toISOString(),
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
        worker_processing_mode: payload[WORKER_PROCESSING_MODE_FIELD] || null,
        missing_info: Array.isArray(payload.missing_info) ? payload.missing_info : [],
        notes: getClinicalReviewNote(
          resolveWorkerProcessingMode(payload[WORKER_PROCESSING_MODE_FIELD]),
        ),
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
