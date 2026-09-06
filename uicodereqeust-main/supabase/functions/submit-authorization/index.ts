// submit-authorization
//
// Internal API used by the whatsapp-worker (and any other internal automation).
// Authenticated by `X-Api-Key` matching `MEDAUTH_INTERNAL_API_KEY`. Uses the
// service role to bypass the `Hospitals can create pending requests` RLS policy
// while still writing the same columns a hospital user would write.
//
// WhatsApp security is enforced twice:
//   1. This function resolves the sender from the persisted WhatsApp message and
//      requires an active hospital contact in user_roles.
//   2. A database BEFORE INSERT trigger independently enforces the same sender
//      identity and exact beneficiary match, protecting the worker fallback path.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureArrivalPin } from "../_shared/arrival-pin.ts";

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

function sanitize(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max).replace(/[<>]/g, "");
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
  if (!MEDAUTH_API_KEY || provided !== MEDAUTH_API_KEY) {
    return bad(401, "invalid_api_key");
  }
  if (WORKER_SHARED_SECRET) {
    const ws = req.headers.get("x-worker-secret") || "";
    if (ws !== WORKER_SHARED_SECRET && provided !== MEDAUTH_API_KEY) {
      return bad(401, "invalid_api_key");
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid_json");
  }

  const source = sanitize(body.source, 40).toLowerCase() || "whatsapp";
  const whatsappMessageId =
    sanitize(body.whatsapp_message_id || body.source_message_id, 120) || null;
  const supabase = getServiceClient();

  let phoneNumber = sanitize(body.phone_number, 32);
  let patientName = sanitize(body.patient_name, 200);
  let policyNumber = sanitize(body.policy_number, 80);
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
    if (!phoneNumber) return bad(400, "phone_number_required");

    const rawHospitalName = sanitize(
      body.hospital_name || body.provider_name,
      200,
    );
    if (rawHospitalName) {
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
  const rawMessage = sanitize(body.raw_message, 4000) || null;
  const missingInfo = Array.isArray(body.missing_info)
    ? body.missing_info.slice(0, 10)
    : [];
  const patientId = sanitize(body.patient_id, 80) || null;

  const rawReferralHospitalName = sanitize(body.referral_hospital_name, 200);
  let referralHospitalId: string | null = null;
  let referralHospitalName: string | null = rawReferralHospitalName || null;

  if (rawReferralHospitalName) {
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

  let detectedItems: any[] = [];
  if (treatment && treatment !== "Not provided") {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 12000);
      const { data: parseResult } = await supabase.functions
        .invoke(
          "parse-request-text",
          { body: { text: treatment } },
          { signal: ac.signal } as any,
        )
        .catch(() => ({ data: null as any }));
      clearTimeout(timer);
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

  const clinicalNotes = JSON.stringify({
    source,
    patient_id_free_text: patientId,
    provider_name_free_text: providerName,
    referral_to: referralHospitalName,
    missing_info: missingInfo,
    whatsapp_message_id: whatsappMessageId,
    whatsapp_sender_phone: source === "whatsapp" ? whatsappSenderPhone : null,
    captured_at: new Date().toISOString(),
  });

  const insertPayload: Record<string, unknown> = {
    patient_name: patientName,
    policy_number: policyNumber,
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
    whatsapp_raw_message: whatsappMessageId,
    status: "pending",
    submitted_by: null,
  };

  const { data: row, error: insErr } = await supabase
    .from("authorization_requests")
    .insert(insertPayload)
    .select("id, request_id, status")
    .single();

  if (insErr || !row) {
    console.error("submit-authorization: insert failed", insErr);
    return bad(500, "insert_failed: " + (insErr?.message || "unknown"));
  }

  if (source === "whatsapp") {
    try {
      await ensureArrivalPin(supabase, row.id);
    } catch (error) {
      await supabase.from("authorization_requests").delete().eq("id", row.id);
      console.error(
        "submit-authorization: arrival PIN creation failed",
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
