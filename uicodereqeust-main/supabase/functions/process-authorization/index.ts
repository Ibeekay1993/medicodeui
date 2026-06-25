// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, sanitizeString, validateUser } from "../_shared/auth.ts";

type ApprovedItem = {
  code?: string | null;
  name?: string;
  category?: string | null;
  amount?: number;
  price?: number;
  unit_price?: number;
  quantity?: number;
  frequency?: string;
  duration?: string;
  matched_via?: string;
  matched_text?: string;
};

function getInitials(nameOrEmail?: string | null) {
  const raw = String(nameOrEmail || "").trim();
  const source = raw.includes("@") ? raw.split("@")[0].replace(/[._-]+/g, " ") : raw;
  const parts = source
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "AG";
}

/**
 * Normalize a hospital name for comparison (lowercase, strip punctuation/whitespace).
 */
function normalizeHospitalName(name: string): string {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Look up a hospital's UUID by its name.
 * Uses ILIKE for partial matching and confirms via normalized comparison.
 * Returns null if no match found.
 */
async function findHospitalIdByName(supabase: any, name: string): Promise<string | null> {
  if (!name || !name.trim()) return null;
  const normalizedInput = normalizeHospitalName(name);
  try {
    const { data, error } = await supabase
      .from("hospitals")
      .select("id, name")
      .ilike("name", `%${name.trim()}%`)
      .limit(5);

    if (error || !data || data.length === 0) return null;

    // Prefer exact normalized match
    for (const h of data) {
      if (normalizeHospitalName(h.name) === normalizedInput) {
        return h.id;
      }
    }
    // Fallback to first result
    return data[0].id;
  } catch (err) {
    console.error("Error looking up hospital by name:", err);
    return null;
  }
}

/**
 * Invoke a sibling edge function using the Supabase service URL + service key.
 * Uses fire-and-forget pattern (non-blocking).
 */
async function invokeFunction(functionName: string, body: Record<string, unknown>): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return;

  try {
    await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`invokeFunction(${functionName}) error:`, err);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user } = await validateUser(req, ["nurse", "admin"]);
    const body = await req.json();
    const requestId = sanitizeString(body.request_id || body.auth_id || body.id, 120);
    const action = sanitizeString(body.action, 20).toLowerCase();
    const notes = sanitizeString(body.notes, 1000);
    const approvedItems = Array.isArray(body.approved_items) ? body.approved_items as ApprovedItem[] : [];
    const referredHospitalId = sanitizeString(body.referred_hospital_id, 120) || null;
    const referredHospitalName = sanitizeString(body.referred_hospital_name, 240) || null;

    if (!requestId || !["approve", "decline", "reject"].includes(action)) {
      throw new Error("Invalid authorization action");
    }

    const supabase = getServiceClient();
    const { data: requestRow, error: requestError } = await supabase
      .from("authorization_requests")
      .select("id,status,authorization_code,patient_name,patient_email,policy_number,hospital_id,hospital_name,requesting_hospital_id,requesting_hospital_name,referring_hospital_id,referring_hospital_name,referred_hospital_id,referred_hospital_name")
      .or(`id.eq.${requestId},request_id.eq.${requestId}`)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!requestRow) throw new Error("Authorization request not found");

    // Accept both standard requests (pending) and referral requests (pending_referral)
    const acceptableStatuses = ["pending", "pending_referral"];
    if (!acceptableStatuses.includes(requestRow.status)) {
      throw new Error(`Authorization already processed (current status: ${requestRow.status})`);
    }

    // A pending_referral was submitted with a receiving hospital already set —
    // insurer approval must produce referral_approved (not approved), so Hospital B can see it.
    const isIncomingReferral = requestRow.status === "pending_referral";


    const decidedAt = new Date().toISOString();
    const { data: nurseProfile } = await supabase
      .from("user_roles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const nurseName = nurseProfile?.full_name || user.user_metadata?.full_name || user.email || "Unknown nurse";
    const nurseInitials = getInitials(nurseName);

    if (action === "approve") {
      if (!approvedItems.length) throw new Error("At least one approved NHIA item is required");
      const codes = approvedItems.map((item) => String(item.code || "").trim()).filter(Boolean);
      if (!codes.length) throw new Error("Approved items must include NHIA codes");

      const { data: nhiaItems, error: itemsError } = await supabase
        .from("nhia_items")
        .select("code,name,category,amount")
        .in("code", codes)
        .eq("is_active", true);

      if (itemsError) throw itemsError;
      if (!nhiaItems || nhiaItems.length !== new Set(codes).size) {
        throw new Error("One or more NHIA codes were not found");
      }

      const validByCode = new Map(nhiaItems.map((item: any) => [item.code, item]));
      const requestedByCode = new Map(approvedItems.map((item) => [String(item.code || "").trim(), item]));
      const normalizedItems = codes.map((code) => {
        const item = validByCode.get(code) as any;
        const requested = requestedByCode.get(code) || {};
        const unitPrice = Number(requested.unit_price ?? item.amount ?? requested.price ?? 0);
        const quantity = Math.max(1, Number(requested.quantity || 1));
        return {
          code: item.code,
          name: item.name,
          category: item.category,
          unit_price: unitPrice,
          quantity,
          amount: unitPrice * quantity,
          frequency: requested.frequency || null,
          duration: requested.duration || null,
          matched_via: requested.matched_via || null,
          matched_text: requested.matched_text || null,
        };
      });
      const total = normalizedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const first = normalizedItems[0];
      let authorizationCode = requestRow.authorization_code;
      if (!authorizationCode) {
        const { data: generatedCode, error: codeError } = await supabase.rpc("generate_auth_code", {
          nurse_initials: nurseInitials,
        });
        if (codeError) throw codeError;
        authorizationCode = generatedCode;
      }

      // Preserve existing referral assignment if new one not explicitly provided
      let finalReferredHospitalId = referredHospitalId || requestRow.referred_hospital_id || null;
      let finalReferredHospitalName = referredHospitalName || requestRow.referred_hospital_name || null;

      // If we have a name but no ID, try to look up the ID by name
      if (!finalReferredHospitalId && finalReferredHospitalName) {
        const foundId = await findHospitalIdByName(supabase, finalReferredHospitalName);
        if (foundId) {
          finalReferredHospitalId = foundId;
        }
      }

      // For pending_referral requests: always set referral_approved.
      // For pending requests: set referral_approved if a referred hospital is present, otherwise approved.
      const finalStatus = (isIncomingReferral || finalReferredHospitalId) ? "referral_approved" : "approved";

      const { error: updateError } = await supabase
        .from("authorization_requests")
        .update({
          status: finalStatus,
          authorization_code: authorizationCode,
          requesting_hospital_id: requestRow.requesting_hospital_id || requestRow.hospital_id || null,
          requesting_hospital_name: requestRow.requesting_hospital_name || requestRow.hospital_name || null,
          referring_hospital_id: requestRow.referring_hospital_id || requestRow.hospital_id || null,
          referring_hospital_name: requestRow.referring_hospital_name || requestRow.hospital_name || null,
          referred_hospital_id: finalReferredHospitalId,
          referred_hospital_name: finalReferredHospitalName,
          claiming_hospital_id: finalReferredHospitalId || requestRow.hospital_id || null,
          claiming_hospital_name: finalReferredHospitalName || requestRow.hospital_name || null,
          treatment: normalizedItems.map((item) => `${item.code} - ${item.name}`).join("; "),
          approved_items: normalizedItems,
          total_amount: total,
          approved_tariff_code: first.code,
          approved_tariff_name: first.name,
          approved_tariff_category: first.category,
          approved_tariff_amount: first.amount,
          decision_reason: notes || null,
          clinical_notes: notes || null,
          decided_by: user.id,
          approved_by: user.id,
          nurse_initials: nurseInitials,
          authorized_by_name: nurseName,
          authorized_by_email: user.email || null,
          decided_at: decidedAt,
          updated_at: decidedAt,
        } as any)
        .eq("id", requestRow.id);

      if (updateError) throw updateError;

      // Fire-and-forget side effects (non-blocking)
      if (finalReferredHospitalId && requestRow.patient_email) {
        // 1. Patient referral notification email
        void invokeFunction("send-referral-notification", {
          authorization_id: requestRow.id,
        });
      } else if (!finalReferredHospitalId && requestRow.patient_email) {
        // Standard approval email for non-referrals
        void invokeFunction("send-approval-email", {
          authorization_id: requestRow.id,
        });
      }

      // 2. Pre-generate OTP so it appears immediately in nurse queue
      if (requestRow.patient_email) {
        void invokeFunction("send-otp", {
          authorization_id: requestRow.id,
          patient_email: requestRow.patient_email,
          policy_number: requestRow.policy_number,
          otp_type: "ARRIVAL",
          hospital_id: finalReferredHospitalId || requestRow.hospital_id,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: finalStatus,
          authorization_code: authorizationCode,
          total_amount: total,
          item_count: normalizedItems.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decline / Reject path
    const { error: updateError } = await supabase
      .from("authorization_requests")
      .update({
        status: "rejected",
        decision_reason: notes || "Declined",
        clinical_notes: notes || "Declined",
        decided_by: user.id,
        decided_at: decidedAt,
        updated_at: decidedAt,
      } as any)
      .eq("id", requestRow.id);

    if (updateError) throw updateError;

    // Fire-and-forget: patient rejection notification
    if (requestRow.patient_email) {
      void invokeFunction("send-rejection-email", {
        authorization_id: requestRow.id,
      });
    }

    return new Response(
      JSON.stringify({ success: true, status: "rejected" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: true, message: err instanceof Error ? err.message : "Request failed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
