// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, sanitizeString, validateUser } from "../_shared/auth.ts";

function generateClaimNumber() {
  const now = new Date();
  const date = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getFullYear()).slice(-2)}`;
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CLM-${date}-${suffix}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user, profile } = await validateUser(req, ["hospital"]);
    const { auth_id, request_id } = await req.json();
    const requestId = sanitizeString(auth_id || request_id, 120);
    if (!requestId) throw new Error("Authorization request ID required");
    if (!profile.hospital_id) throw new Error("Hospital profile not found");

    const supabase = getServiceClient();
    const { data: auth, error: authError } = await supabase
      .from("authorization_requests")
      .select("id,status,authorization_code,hospital_id,hospital_name,requesting_hospital_id,requesting_hospital_name,referring_hospital_id,referring_hospital_name,referred_hospital_id,referred_hospital_name,claiming_hospital_id,claiming_hospital_name,patient_name,policy_number,diagnosis,treatment,approved_items,total_amount,approved_tariff_code,approved_tariff_name,approved_tariff_amount")
      .or(`id.eq.${requestId},request_id.eq.${requestId}`)
      .maybeSingle();

    if (authError) throw authError;
    if (!auth) throw new Error("Authorization not found");
    const claimOwnerId = auth.claiming_hospital_id || auth.referred_hospital_id || auth.hospital_id;
    const claimOwnerName = auth.claiming_hospital_name || auth.referred_hospital_name || auth.hospital_name || "the treating hospital";
    if (claimOwnerId !== profile.hospital_id) {
      throw new Error(`Only ${claimOwnerName} can submit claims for this referral authorization`);
    }
    if (auth.status !== "approved") throw new Error("Authorization is not approved");
    if (!auth.authorization_code) throw new Error("Approved authorization code is missing");

    const { data: existingClaim } = await supabase
      .from("hospital_claims")
      .select("id,claim_number,status")
      .eq("request_id", auth.id)
      .maybeSingle();

    if (existingClaim) throw new Error(`Claim already exists: ${existingClaim.claim_number}`);

    const approvedItems = Array.isArray(auth.approved_items) ? auth.approved_items : [];
    const claimNumber = generateClaimNumber();
    const approvedFor = approvedItems.length
      ? approvedItems.map((item: any) => `${item.code || "NHIA"} - ${item.name || "Approved item"}`).join("; ")
      : auth.treatment || "Approved service";

    const { data: claim, error: claimError } = await supabase
      .from("hospital_claims")
      .insert({
        hospital_id: profile.hospital_id,
        hospital_name: profile.name,
        request_id: auth.id,
        claim_number: claimNumber,
        auth_code: auth.authorization_code,
        patient_name: auth.patient_name,
        policy_number: auth.policy_number,
        diagnosis: auth.diagnosis || "No diagnosis",
        approved_for: approvedFor,
        approved_items: approvedItems,
        requesting_hospital_id: auth.requesting_hospital_id || auth.hospital_id || null,
        requesting_hospital_name: auth.requesting_hospital_name || auth.hospital_name || null,
        referring_hospital_id: auth.referring_hospital_id || auth.hospital_id || null,
        referring_hospital_name: auth.referring_hospital_name || auth.hospital_name || null,
        referred_hospital_id: auth.referred_hospital_id || null,
        referred_hospital_name: auth.referred_hospital_name || null,
        claiming_hospital_id: profile.hospital_id,
        claiming_hospital_name: profile.name,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        notes: "",
        created_by: user.id,
      } as any)
      .select("*")
      .single();

    if (claimError) throw claimError;

    const lines = approvedItems.length
      ? approvedItems.map((item: any) => ({
          claim_id: claim.id,
          description: item.name || "Approved item",
          code: item.code || "NHIA",
          units: Math.max(1, Number(item.quantity || 1)),
          charge: Number(item.unit_price || item.price || item.amount || 0),
        }))
      : [{
          claim_id: claim.id,
          description: auth.approved_tariff_name || auth.treatment || "Approved service",
          code: auth.approved_tariff_code || auth.authorization_code,
          units: 1,
          charge: Number(auth.approved_tariff_amount || auth.total_amount || 0),
        }];

    const { error: lineError } = await supabase.from("hospital_claim_lines").insert(lines as any);
    if (lineError) throw lineError;

    await supabase
      .from("authorization_requests")
      .update({
        claimed: true,
        claim_status: "submitted",
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", auth.id);

    await supabase.from("audit_logs").insert({
      action: "CLAIM_SUBMITTED",
      user_id: user.id,
      details: {
        claim_id: claim.id,
        claim_number: claimNumber,
        request_id: auth.id,
        auth_code: auth.authorization_code,
        amount: claim.total_amount,
      },
      severity: "info",
    }).then(() => undefined);

    return new Response(JSON.stringify({ success: true, claim_id: claim.id, claim_number: claimNumber, status: "submitted" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: true, message: err instanceof Error ? err.message : "Request failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
