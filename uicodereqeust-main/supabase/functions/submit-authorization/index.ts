// submit-authorization
//
// Trusted intake for the whatsapp-worker and authenticated nurse/admin parser.
// Internal automation uses `X-Api-Key`; browser callers must present a valid
// Supabase bearer token and an authorized clinical staff role. The server uses
// service role for the insert and derives browser parser provenance itself.
//
// WhatsApp security is enforced twice:
//   1. This function resolves the sender from the persisted WhatsApp message and
//      requires an active hospital contact in user_roles.
//   2. A database BEFORE INSERT trigger independently enforces the same sender
//      identity and exact beneficiary match, protecting the worker fallback path.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureArrivalPin } from "../_shared/arrival-pin.ts";
import { isClinicallyDecidedAuthorization } from "../_shared/authorization-state.ts";
import { schedulePendingAuthorizationPush } from "../_shared/pending-auth-push.ts";
import {
  deriveAuthorizationProvenance,
  isSameParserSubmissionReplay,
} from "../_shared/authorization-provenance.ts";
import {
  DETERMINISTIC_ONLY_WORKER_MODE,
  MANUAL_TARIFF_REVIEW_NOTE,
  WORKER_PROCESSING_MODE_FIELD,
  getClinicalReviewNote,
  resolveWorkerProcessingMode,
  shouldAutoMatchTariffItems,
} from "../_shared/whatsapp-worker-mode.ts";
import {
  assertMfaForSensitiveAction,
  getAssuranceLevel,
  getSensitiveActionErrorStatus,
} from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const MEDAUTH_API_KEY = Deno.env.get("MEDAUTH_INTERNAL_API_KEY") || "";
const WORKER_SHARED_SECRET = Deno.env.get("WHATSAPP_WORKER_SECRET") || "";

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function mapUrgency(
  level: unknown,
): "routine" | "low" | "standard" | "urgent" | "emergency" {
  const n = Math.max(1, Math.min(5, Number(level ?? 3) | 0));
  return ["routine", "low", "standard", "urgent", "emergency"][n - 1] as
    | "routine"
    | "low"
    | "standard"
    | "urgent"
    | "emergency";
}

function bad(status: number, message: string) {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitize(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max).replace(/[<>]/g, "");
}

function preserveMessage(value: unknown, max = 4000): string {
  return String(value ?? "").trim().slice(0, max);
}

function normalizePhone(value: string): string {
  let digits = value.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) {
    digits = `234${digits.slice(1)}`;
  }
  return digits;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "method_not_allowed");

  const provided = req.headers.get("x-api-key") || "";
  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_json");
  }

  const isInternalCall = Boolean(MEDAUTH_API_KEY && provided === MEDAUTH_API_KEY);
  if (provided && !isInternalCall) return bad(401, "invalid_api_key");

  const supabase = getServiceClient();
  let authenticatedUserId: string | null = null;
  let submitActor:
    | { kind: "internal" }
    | { kind: "user"; userId: string; roles: string[] };

  if (isInternalCall) {
    if (WORKER_SHARED_SECRET) {
      const workerSecret = req.headers.get("x-worker-secret") || "";
      if (workerSecret !== WORKER_SHARED_SECRET && provided !== MEDAUTH_API_KEY) {
        return bad(401, "invalid_api_key");
      }
    }
    submitActor = { kind: "internal" };
  } else {
    const authorization = req.headers.get("authorization") || "";
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!accessToken) return bad(401, "authentication_required");

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData.user) return bad(401, "authentication_required");
    authenticatedUserId = authData.user.id;

    try {
      await assertMfaForSensitiveAction(
        authenticatedUserId,
        getAssuranceLevel(authorization, authenticatedUserId),
      );
    } catch (error) {
      console.error("submit-authorization: MFA verification failed", error);
      const status = getSensitiveActionErrorStatus(error);
      return bad(status, status === 403 ? "mfa_verification_required" : "mfa_policy_check_failed");
    }

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authenticatedUserId)
      .in("role", ["nurse", "admin", "utilization_manager", "utilization_manager_lead"]);
    if (roleError) return bad(500, "staff_role_lookup_failed");

    submitActor = {
      kind: "user",
      userId: authenticatedUserId,
      roles: (roleRows || []).map((row: { role: string }) => row.role),
    };
  }

  let provenance;
  try {
    provenance = deriveAuthorizationProvenance(submitActor, body.source);
  } catch {
    return bad(403, "staff_authorization_required");
  }

  // A user JWT can only create a dashboard-parsed WhatsApp request. Its source
  // is derived above from the authenticated staff role, never from body.source.
  const source = provenance.source;
  const requestId = isInternalCall ? null : sanitize(body.request_id, 100);
  if (!isInternalCall && !requestId) return bad(400, "idempotency_key_required");
  const processingMode = resolveWorkerProcessingMode(
    body[WORKER_PROCESSING_MODE_FIELD],
  );
  const deterministicWhatsApp = source === "whatsapp" &&
    processingMode === DETERMINISTIC_ONLY_WORKER_MODE;
  const whatsappMessageId = isInternalCall
    ? sanitize(body.whatsapp_message_id || body.source_message_id, 120) || null
    : null;

  let phoneNumber = sanitize(body.phone_number, 32);
  let patientName = sanitize(body.patient_name, 200);
  let policyNumber = sanitize(body.policy_number, 80);
  let beneficiaryNumber = sanitize(body.beneficiary_number, 80);
  let hospitalId: string | null = null;
  let hospitalName = "";
  let whatsappSenderPhone = "";

  if (source === "whatsapp") {
    if (!whatsappMessageId) {
      return bad(422, "whatsapp_message_id_required");
    }

    const { data: context, error: contextError } = await supabase.rpc(
      "resolve_whatsapp_authorization_context",
      {
        _message_id: whatsappMessageId,
        _patient_name: patientName,
        _policy_number: policyNumber,
      },
    );

    if (contextError) {
      console.error(
        "submit-authorization: WhatsApp security lookup failed",
        contextError.message,
      );
      return bad(500, "whatsapp_security_check_failed");
    }

    if (!context?.ok) {
      const reason = String(context?.reason || "security_validation_failed");
      if (reason === "unregistered_sender" || reason === "ambiguous_sender") {
        return bad(403, "whatsapp_hospital_not_authorized");
      }
      if (reason === "patient_name_required") {
        return bad(422, "patient_name_required");
      }
      if (reason === "policy_number_required") {
        return bad(422, "policy_number_required");
      }
      if (reason === "beneficiary_ambiguous") {
        return bad(422, "beneficiary_ambiguous");
      }
      if (reason === "beneficiary_mismatch") {
        return bad(422, "beneficiary_mismatch");
      }
      return bad(422, reason);
    }

    patientName = sanitize(context.patient_name, 200);
    policyNumber = sanitize(context.policy_number, 80);
    beneficiaryNumber = sanitize(context.beneficiary_number, 80);
    hospitalId = context.hospital_id ? String(context.hospital_id) : null;
    whatsappSenderPhone = normalizePhone(String(context.sender_phone || ""));

    if (!hospitalId || !patientName || !policyNumber) {
      return bad(500, "whatsapp_security_context_incomplete");
    }

    const { data: hospital } = await supabase
      .from("hospitals")
      .select("id, name")
      .eq("id", hospitalId)
      .maybeSingle();

    if (!hospital?.id || !hospital?.name) {
      return bad(403, "whatsapp_hospital_not_authorized");
    }

    hospitalName = sanitize(hospital.name, 200);

    const candidatePatientPhone = sanitize(
      body.patient_phone || body.phone_number,
      32,
    );
    if (
      candidatePatientPhone &&
      normalizePhone(candidatePatientPhone) !== whatsappSenderPhone
    ) {
      phoneNumber = candidatePatientPhone;
    } else {
      phoneNumber = "";
    }
    if (!phoneNumber) return bad(422, "patient_phone_required");
    phoneNumber = normalizePhone(phoneNumber);
  } else {
    if (!phoneNumber && source !== "whatsapp_parser") {
      return bad(400, "phone_number_required");
    }

    const requestedHospitalId = sanitize(body.hospital_id, 80);
    if (requestedHospitalId) {
      const { data: matchedHospital } = await supabase
        .from("hospitals")
        .select("id, name")
        .eq("id", requestedHospitalId)
        .maybeSingle();
      if (!matchedHospital?.id) return bad(422, "hospital_not_found");
      hospitalId = matchedHospital.id;
      hospitalName = matchedHospital.name;
    }

    const rawHospitalName = sanitize(
      body.hospital_name || body.provider_name,
      200,
    );
    if (!hospitalId && rawHospitalName) {
      let searchName = rawHospitalName;
      const lower = rawHospitalName.toLowerCase();
      if (lower.includes("university health service") || lower.includes("jaja")) {
        searchName = "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)";
      }
      const { data: matchedHospitals } = await supabase
        .from("hospitals")
        .select("id, name")
        .ilike(
          "name",
          `%${searchName.split(" ").slice(0, 3).join(" ")}%`,
        )
        .limit(1);
      if (matchedHospitals?.length) {
        hospitalId = matchedHospitals[0].id;
        hospitalName = matchedHospitals[0].name;
      } else {
        hospitalName = searchName;
      }
    }
  }

  const providerName = sanitize(body.provider_name, 200) || "Not provided";
  const procedureType = sanitize(body.procedure_type, 200) || "Not provided";
  const diagnosis =
    sanitize(body.diagnosis, 1000) ||
    (procedureType !== "Not provided"
      ? `Pending clinical review — ${procedureType}`
      : "Pending clinical review");
  const treatment = sanitize(body.treatment, 1000) || procedureType;
  const urgency = mapUrgency(body.urgency_level);
  const rawMessage = preserveMessage(body.raw_message, 4000) || null;
  const missingInfo = Array.isArray(body.missing_info)
    ? body.missing_info.slice(0, 10)
    : [];
  if (
    deterministicWhatsApp &&
    missingInfo.length < 10 &&
    !missingInfo.includes(MANUAL_TARIFF_REVIEW_NOTE)
  ) {
    missingInfo.push(MANUAL_TARIFF_REVIEW_NOTE);
  }
  const patientId = sanitize(body.patient_id, 80) || null;

  // The parser page historically allows incomplete phone/policy details for
  // human review. When it has both values, retain the cross-family guard.
  // Webhook and other internal submissions keep the existing required check.
  if (source !== "whatsapp_parser" || (phoneNumber && policyNumber)) {
    const phoneCheck = await supabase.rpc("register_policy_phone", {
      p_phone: phoneNumber,
      p_family_policy: policyNumber,
    });
    if (phoneCheck.error) {
      console.error("submit-authorization: patient phone registry failed", phoneCheck.error.message);
      return bad(500, "patient_phone_registry_failed");
    }
    if (!phoneCheck.data?.allowed) {
      return new Response(JSON.stringify({
        error: true,
        code: "phone_family_conflict",
        message: String(phoneCheck.data?.reason || "Request not submitted: this patient phone number is already registered for a different family policy. No authorization request has been created."),
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const rawReferralHospitalName = sanitize(body.referral_hospital_name, 200);
  let referralHospitalId: string | null = null;
  let referralHospitalName: string | null = rawReferralHospitalName || null;

  if (rawReferralHospitalName) {
    const requestedReferralId = sanitize(body.referral_hospital_id, 80);
    if (requestedReferralId) {
      const { data: matchedReferral } = await supabase
        .from("hospitals")
        .select("id, name")
        .eq("id", requestedReferralId)
        .maybeSingle();
      if (!matchedReferral?.id) return bad(422, "referral_hospital_not_found");
      referralHospitalId = matchedReferral.id;
      referralHospitalName = matchedReferral.name;
    } else {
      let searchReferral = rawReferralHospitalName;
      const lowerRef = rawReferralHospitalName.toLowerCase();
      if (
        lowerRef.includes("uch") ||
        lowerRef.includes("university college hospital")
      ) {
        searchReferral = "UNIVERSITY COLLEGE HOSPITAL";
      }
      const { data: matchedRefHospitals } = await supabase
        .from("hospitals")
        .select("id, name")
        .ilike(
          "name",
          `%${searchReferral.split(" ").slice(0, 3).join(" ")}%`,
        )
        .limit(1);
      if (matchedRefHospitals?.length) {
        referralHospitalId = matchedRefHospitals[0].id;
        referralHospitalName = matchedRefHospitals[0].name;
      } else {
        referralHospitalName = searchReferral;
      }
    }
  }

  let detectedItems: any[] = source === "whatsapp_parser" && Array.isArray(body.approved_items)
    ? body.approved_items.slice(0, 50)
    : [];
  if (
    source !== "whatsapp_parser" &&
    shouldAutoMatchTariffItems(source, processingMode) &&
    treatment &&
    treatment !== "Not provided"
  ) {
    try {
      const { data: parseResult } = await supabase.functions
        .invoke(
          "parse-request-text",
          { body: { text: treatment }, timeout: 12_000 },
        )
        .catch(() => ({ data: null as any }));
      if (parseResult?.items && Array.isArray(parseResult.items)) {
        detectedItems = parseResult.items.map((item: any) => ({
          code: item.code,
          name: item.name,
          category: item.category,
          amount: Number(item.amount || 0),
          unit_price: Number(item.unit_price || 0),
          quantity: Number(item.quantity || 1),
          matched_via: item.matched_via || "auto",
          confidence: item.confidence || "high",
        }));
      }
    } catch (e) {
      console.warn(
        "submit-authorization: auto-detect tariff error",
        (e as Error)?.message || e,
      );
    }
  }

  const clinicalNotes = source === "whatsapp_parser"
    ? sanitize(body.clinical_notes, 2000) || null
    : JSON.stringify({
      source,
      patient_id_free_text: patientId,
      provider_name_free_text: providerName,
      referral_to: referralHospitalName,
      missing_info: missingInfo,
      worker_processing_mode: deterministicWhatsApp
        ? DETERMINISTIC_ONLY_WORKER_MODE
        : null,
      notes: deterministicWhatsApp
        ? getClinicalReviewNote(processingMode)
        : null,
      whatsapp_message_id: whatsappMessageId,
      whatsapp_sender_phone: source === "whatsapp" ? whatsappSenderPhone : null,
      captured_at: new Date().toISOString(),
    });

  const insertPayload: Record<string, unknown> = {
    patient_name: patientName,
    policy_number: policyNumber,
    beneficiary_number: beneficiaryNumber || null,
    diagnosis,
    treatment,
    patient_phone: phoneNumber || null,
    hospital_name: hospitalName || null,
    hospital_id: hospitalId,
    requesting_hospital_id: hospitalId,
    requesting_hospital_name: hospitalName || null,
    referring_hospital_id: hospitalId,
    referring_hospital_name: hospitalName || null,
    referred_hospital_id: referralHospitalId,
    referred_hospital_name: referralHospitalName,
    claiming_hospital_id: referralHospitalId || hospitalId,
    claiming_hospital_name: referralHospitalName || hospitalName,
    approved_items: detectedItems,
    doctor_name: "WhatsApp automated intake",
    urgency,
    source,
    clinical_notes: clinicalNotes,
    whatsapp_message_id: whatsappMessageId,
    whatsapp_raw_message: source === "whatsapp"
      ? whatsappMessageId
      : source === "whatsapp_parser"
      ? rawMessage
      : null,
    status: "pending",
    submitted_by: provenance.submittedBy,
    ...(source === "whatsapp_parser" ? { request_id: requestId } : {}),
  };

  const { data: row, error: insErr } = await supabase
    .from("authorization_requests")
    .insert(insertPayload)
    .select("id, request_id, status")
    .single();

  if (insErr?.code === "23505") {
    const { data: existing } = source === "whatsapp_parser" && requestId
      ? await supabase
        .from("authorization_requests")
        .select("id, request_id, status, authorization_code, approved_by, decided_at, decided_by, decision_reason, source, submitted_by, hospital_id, patient_name, policy_number, beneficiary_number, diagnosis, treatment, patient_phone, referred_hospital_id, whatsapp_raw_message, urgency, clinical_notes, approved_items")
        .eq("request_id", requestId)
        .maybeSingle()
      : whatsappMessageId
      ? await supabase
        .from("authorization_requests")
          .select("id, request_id, status, authorization_code, approved_by, decided_at, decided_by, decision_reason, source, submitted_by")
        .eq("whatsapp_message_id", whatsappMessageId)
        .maybeSingle()
      : { data: null };
    if (existing) {
      if (
        source === "whatsapp_parser" &&
        !isSameParserSubmissionReplay(
          existing,
          { ...insertPayload, request_id: requestId },
          authenticatedUserId || "",
        )
      ) {
        return bad(409, "idempotency_key_conflict");
      }
      if (
        source === "whatsapp" &&
        !isClinicallyDecidedAuthorization(existing)
      ) {
        try {
          await ensureArrivalPin(supabase, existing.id);
        } catch (error) {
          console.error(
            "submit-authorization: existing request PIN repair failed",
            error instanceof Error ? error.message : error,
          );
          return bad(500, "arrival_pin_creation_failed");
        }
      }
      return ok({ ok: true, id: existing.id, request_id: existing.request_id, status: existing.status });
    }
  }
  if (insErr || !row) {
    console.error("submit-authorization: insert failed", insErr);
    return bad(500, "insert_failed: " + (insErr?.message || "unknown"));
  }

  if (source === "whatsapp") {
    if (row.status === "pending") {
      // Push from the durable authorization row even if arrival-PIN setup
      // encounters a transient failure. A retry repairs the PIN without
      // recreating the request or dispatching a second push.
      schedulePendingAuthorizationPush(supabase, row.id, hospitalName);
    }
    try {
      await ensureArrivalPin(supabase, row.id);
    } catch (error) {
      console.error(
        "submit-authorization: authorization kept; arrival PIN creation failed",
        error instanceof Error ? error.message : error,
      );
      return bad(500, "arrival_pin_creation_failed");
    }
  }

  if (whatsappMessageId) {
    await supabase
      .from("whatsapp_messages")
      .update({ internal_request_id: row.id })
      .eq("message_id", whatsappMessageId);
  }

  return new Response(
    JSON.stringify({
      id: row.id,
      request_id: row.request_id,
      status: row.status,
    }),
    {
      status: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
