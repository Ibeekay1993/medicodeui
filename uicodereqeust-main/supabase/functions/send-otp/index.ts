// @ts-nocheck
// SECURITY: OTP values are never returned in API responses.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser } from "../_shared/auth.ts";

async function generateUniqueOTP(supabase: any): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed O, 0, 1, I
  let attempts = 0;
  while (attempts < 10) {
    let pin = "";
    const array = new Uint8Array(6);
    crypto.getRandomValues(array);
    for (let i = 0; i < 6; i++) {
      pin += chars[array[i] % chars.length];
    }
    
    // Check if OTP exists for any UNVERIFIED or ACTIVE request
    const { data, error } = await supabase
      .from("otp_verifications")
      .select("id")
      .eq("otp_value", pin)
      .eq("verified", false)
      .maybeSingle();
      
    if (!data && !error) return pin; // Unique!
    attempts++;
  }
  throw new Error("Failed to generate a unique OTP after 10 attempts");
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user } = await validateUser(req, ["utilization_manager", "admin", "hospital", "claims"]);
    const supabase = getServiceClient();

    // patient_email can be empty/missing for whatsapp parser requests
    const { authorization_id, patient_email, policy_number, otp_type, hospital_id } = await req.json();

    if (!authorization_id) throw new Error("authorization_id is required");
    
    // Default email if none provided
    const safeEmail = patient_email || "no-email@medicode.com";

    const { data: existingPin } = await supabase
      .from("otp_verifications")
      .select("id, verified, expires_at, otp_value, otp_type")
      .eq("authorization_id", authorization_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPin) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "OTP already exists for this request",
          email_status: "skipped",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const otp = await generateUniqueOTP(supabase);
    const otpHash = await sha256Hex(otp);
    // 10 years expiration
    const expiresAt = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString();

    await supabase
      .from("otp_verifications")
      .delete()
      .eq("authorization_id", authorization_id)
      .eq("verified", false);

    const { error: insertError } = await supabase
      .from("otp_verifications")
      .insert({
        authorization_id,
        otp_hash: otpHash,
        otp_value: otp,
        email: safeEmail,
        expires_at: expiresAt,
        created_by: user.id,
        otp_type: otp_type || "ARRIVAL",
        hospital_id: hospital_id || null,
      });

    if (insertError) throw insertError;

    // Based on Option A, we DO NOT send an email here. The email is only sent on approval.
    const emailStatus = "skipped";

    await supabase.from("audit_logs").insert({
      action: "otp_generated",
      user_id: user.id,
      details: {
        authorization_id,
        patient_email: safeEmail,
        policy_number,
        email_status: emailStatus,
        note: "Email intentionally skipped until approval (Option A)",
      },
      severity: "info",
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "OTP generated. Email skipped (will be sent on approval).",
        email_status: emailStatus,
        error_message: null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-otp error:", err);
    return new Response(
      JSON.stringify({ error: true, message: err instanceof Error ? err.message : "Failed to generate OTP" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});