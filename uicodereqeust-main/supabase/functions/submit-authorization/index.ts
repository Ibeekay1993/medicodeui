// submit-authorization
//
// Internal API used by the whatsapp-worker (and any other internal automation).
// Authenticated by `X-Api-Key` matching `MEDAUTH_INTERNAL_API_KEY`. Uses the
// service role to bypass the `Hospitals can create pending requests` RLS policy
// while still writing the same columns a hospital user would write.
//
// Body shape (kept loose to match what the worker sends):
// {
//   "source": "whatsapp",          // tracked for audit; optional
//   "patient_id": "P-001" | null,  // free-text patient reference
//   "patient_name"?: string,       // optional; if missing, derived from phone
//   "policy_number"?: string,      // optional
//   "phone_number": "2348012...",  // required
//   "provider_name"?: string,      // hospital/provider name (free text)
//   "procedure_type"?: string,
//   "diagnosis"?: string,          // synthesized from message if absent
//   "urgency_level"?: 1|2|3|4|5,   // mapped to urgency TEXT below
//   "missing_info"?: string[],
//   "raw_message"?: string,
//   "whatsapp_message_id"?: string // Meta wamid for cross-link
// }
//
// Response: { "id": "<uuid>", "request_id": "REQ-YYYYMMDD-NNN", "status": "pending" }
//
// Free-tier note: this function does NOT call Gemini or Meta itself. It only writes
// a row in authorization_requests. The actual extraction happened upstream in the
// worker, and the template reply happens after this returns.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const MEDAUTH_API_KEY = Deno.env.get("MEDAUTH_INTERNAL_API_KEY") || "";
// Optional override: require this additional header to scope the worker → this fn
const WORKER_SHARED_SECRET = Deno.env.get("WHATSAPP_WORKER_SECRET") || "";

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function mapUrgency(level: unknown): "routine" | "low" | "standard" | "urgent" | "emergency" {
  const n = Math.max(1, Math.min(5, Number(level ?? 3) | 0));
  return ["routine", "low", "standard", "urgent", "emergency"][n - 1] as
    "routine" | "low" | "standard" | "urgent" | "emergency";
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "method_not_allowed");

  // ── 1) Authenticate ─────────────────────────────────────────────────────
  const provided = req.headers.get("x-api-key") || "";
  if (!MEDAUTH_API_KEY || provided !== MEDAUTH_API_KEY) {
    return bad(401, "invalid_api_key");
  }
  // If the worker shares a secret, accept that as an alternative credential
  // (lets the worker call us without burning the MEDAUTH key in app logs).
  if (WORKER_SHARED_SECRET) {
    const ws = req.headers.get("x-worker-secret") || "";
    if (ws !== WORKER_SHARED_SECRET && provided !== MEDAUTH_API_KEY) {
      return bad(401, "invalid_api_key");
    }
  }

  // ── 2) Parse + validate ─────────────────────────────────────────────────
  let body: any;
  try { body = await req.json(); } catch { return bad(400, "invalid_json"); }

  const phoneNumber = sanitize(body.phone_number, 32);
  if (!phoneNumber) return bad(400, "phone_number_required");

  // Synthesize display fields. We never auto-claim a patient identity — anything
  // that says "patient is X" must come from the patient (and is therefore free text).
  const patientName = sanitize(body.patient_name, 200) || `WhatsApp patient (${phoneNumber})`;
  const policyNumber = sanitize(body.policy_number, 80) || `WA-${phoneNumber}`;
  const providerName = sanitize(body.provider_name, 200) || "Not provided";
  const procedureType = sanitize(body.procedure_type, 200) || "Not provided";
  const diagnosis = sanitize(body.diagnosis, 1000)
    || (procedureType !== "Not provided" ? `Pending clinical review — ${procedureType}` : "Pending clinical review");
  const treatment = sanitize(body.treatment, 1000) || procedureType;
  const urgency = mapUrgency(body.urgency_level);
  const whatsappMessageId = sanitize(body.whatsapp_message_id || body.source_message_id, 120) || null;
  const rawMessage = sanitize(body.raw_message, 4000) || null;
  const missingInfo = Array.isArray(body.missing_info) ? body.missing_info.slice(0, 10) : [];
  const patientId = sanitize(body.patient_id, 80) || null;

  // Hospital and referral handling
  const rawHospitalName = sanitize(body.hospital_name || body.provider_name, 200);
  const rawReferralHospitalName = sanitize(body.referral_hospital_name, 200);
  
  let hospitalId: string | null = null;
  let hospitalName: string = rawHospitalName;
  let referralHospitalId: string | null = null;
  let referralHospitalName: string | null = rawReferralHospitalName || null;

  const supabase = getServiceClient();

  // Normalize originating hospital
  if (rawHospitalName) {
    let searchName = rawHospitalName;
    const lower = rawHospitalName.toLowerCase();
    if (lower.includes("university health service") || lower.includes("jaja")) {
      searchName = "UNIVERSITY OF IBADAN HEALTH SERVICES (JAJA HEALTH CLINIC)";
    }
    const { data: matchedHospitals } = await supabase
      .from("hospitals")
      .select("id, name")
      .ilike("name", `%${searchName.split(" ").slice(0, 3).join(" ")}%`)
      .limit(1);

    if (matchedHospitals && matchedHospitals.length > 0) {
      hospitalId = matchedHospitals[0].id;
      hospitalName = matchedHospitals[0].name;
    } else {
      hospitalName = searchName;
    }
  }

  // Normalize referral hospital
  if (rawReferralHospitalName) {
    let searchReferral = rawReferralHospitalName;
    const lowerRef = rawReferralHospitalName.toLowerCase();
    if (lowerRef.includes("uch") || lowerRef.includes("university college hospital")) {
      searchReferral = "UNIVERSITY COLLEGE HOSPITAL";
    }
    const { data: matchedRefHospitals } = await supabase
      .from("hospitals")
      .select("id, name")
      .ilike("name", `%${searchReferral.split(" ").slice(0, 3).join(" ")}%`)
      .limit(1);

    if (matchedRefHospitals && matchedRefHospitals.length > 0) {
      referralHospitalId = matchedRefHospitals[0].id;
      referralHospitalName = matchedRefHospitals[0].name;
    } else {
      referralHospitalName = searchReferral;
    }
  }

  // Auto-detect NHIA Tariff Items from treatment/services text
  let detectedItems: any[] = [];
  if (treatment && treatment !== "Not provided") {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 12000);
      const { data: parseResult } = await supabase.functions.invoke("parse-request-text", {
        body: { text: treatment },
      }, { signal: ac.signal } as any).catch(() => ({ data: null as any }));
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
      console.warn("submit-authorization: auto-detect tariff error", (e as Error)?.message || e);
    }
  }

  // Cross-link the request back to the WhatsApp message id (audit trail)
  const clinicalNotes = JSON.stringify({
    source: sanitize(body.source, 40) || "whatsapp",
    patient_id_free_text: patientId,
    provider_name_free_text: hospitalName,
    referral_to: referralHospitalName,
    missing_info: missingInfo,
    whatsapp_message_id: whatsappMessageId,
    captured_at: new Date().toISOString(),
  });

  const insertPayload: Record<string, unknown> = {
    patient_name: patientName,
    policy_number: policyNumber,
    diagnosis,
    treatment,
    patient_phone: phoneNumber,
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
    source: "whatsapp",
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

  // ── 4) Link the WhatsApp message to the new request id ────────────────
  if (whatsappMessageId) {
    await supabase
      .from("whatsapp_messages")
      .update({ internal_request_id: row.id })
      .eq("message_id", whatsappMessageId);
  }

  return new Response(JSON.stringify({
    id: row.id,
    request_id: row.request_id,
    status: row.status,
  }), {
    status: 201,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});