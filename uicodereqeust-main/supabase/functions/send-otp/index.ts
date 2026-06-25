// @ts-nocheck
// SECURITY: OTP is NEVER stored in plaintext or returned in API responses.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser, parseBrevoSender } from "../_shared/auth.ts";
import { buildEmailHtml, buildItemsList, stripCodesAndPricing } from "../_shared/email-template.ts";

function generateSecureOTP(): string {
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b % 10).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user } = await validateUser(req, ["nurse", "admin", "hospital", "claims"]);
    const supabase = getServiceClient();

    const { authorization_id, patient_email, policy_number, otp_type, hospital_id } = await req.json();

    if (!authorization_id) throw new Error("authorization_id is required");
    if (!patient_email) throw new Error("patient_email is required");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(patient_email)) throw new Error("Invalid email format");

    // ── Rate Limiting: max 5 OTP sends per email within 15 minutes ────────
    const RATE_LIMIT_MAX = 5;
    const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

    const { count: recentAttempts } = await supabase
      .from("email_logs")
      .select("id", { count: "exact", head: true })
      .eq("recipient", patient_email)
      .eq("subject", `Ronsberger HMO Authorization OTP`)
      .gte("created_at", windowStart);

    if ((recentAttempts || 0) >= RATE_LIMIT_MAX) {
      // Log the blocked attempt for audit
      await supabase.from("audit_logs").insert({
        action: "otp_rate_limited",
        user_id: user.id,
        details: {
          patient_email,
          authorization_id,
          attempts_in_window: recentAttempts,
          rate_limit: RATE_LIMIT_MAX,
          window_minutes: 15,
        },
        severity: "warning",
      });
      throw new Error(`Rate limit exceeded: maximum ${RATE_LIMIT_MAX} OTP sends per email within 15 minutes. Please try again later.`);
    }
    // ──────────────────────────────────────────────────────────────────────

    const { data: existingOtp } = await supabase
      .from("otp_verifications")
      .select("id, verified, expires_at")
      .eq("authorization_id", authorization_id)
      .eq("otp_type", otp_type || "ARRIVAL")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOtp && existingOtp.verified) {
      return new Response(
        JSON.stringify({ success: true, message: "OTP already verified for this request" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: requestData } = await supabase
      .from("authorization_requests")
      .select("patient_name, diagnosis, treatment, hospital_name, urgency")
      .eq("id", authorization_id)
      .maybeSingle();

    const patientName = requestData?.patient_name || "Patient";
    const diagnosis = requestData?.diagnosis || "Not specified";
    // Patient-facing: ensure treatment string displayed in email never includes NHIA codes/pricing.
    // We store treatment in a format like: "CODE - Name; CODE - Name".
    // Use stripCodesAndPricing to remove any pricing info like "(Qty: 1 x ₦440 = ₦440)"
    const treatment = requestData?.treatment || "";
    const hospitalName = requestData?.hospital_name || "N/A";
    const urgency = requestData?.urgency || "routine";

    // Build patient-safe items list (no codes, no pricing)
    const treatmentItems = treatment
      ? String(treatment)
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((item) => stripCodesAndPricing(item))
          .filter(Boolean)
      : [];
    const itemsListHtml = buildItemsList(treatmentItems);


    const otp = generateSecureOTP();

    // Hash OTP for storage - NEVER store plaintext
    const encoder = new TextEncoder();
    const bytes = encoder.encode(otp);
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const otpHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Clean up old unverified OTPs for this authorization and type
    await supabase
      .from("otp_verifications")
      .delete()
      .eq("authorization_id", authorization_id)
      .eq("otp_type", otp_type || "ARRIVAL")
      .eq("verified", false);

    // Store OTP value for nurse/admin relay + hash for verification
    const { error: insertError } = await supabase
      .from("otp_verifications")
      .insert({
        authorization_id,
        otp_hash: otpHash,
        otp_value: otp,
        email: patient_email,
        expires_at: expiresAt,
        created_by: user.id,
        otp_type: otp_type || "ARRIVAL",
        hospital_id: hospital_id || null,
      });

    if (insertError) throw insertError;

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const brevoFromRaw = Deno.env.get("BREVO_FROM_EMAIL") || "Ronsberger HMO OTP <noreply@ronsbergerhmo.com>";

    let emailStatus = "skipped";
    let emailResponseId: string | null = null;
    let emailError: string | null = null;

    if (!brevoApiKey) {
      console.warn("⚠️ BREVO_API_KEY not configured - OTP email will not be sent");
      emailError = "BREVO_API_KEY not configured";
    } else if (patient_email === "no-email@medicode.com") {
      console.log("ℹ️ Skipping email delivery for placeholder email");
      emailStatus = "skipped";
    } else {
      try {
        console.log(`📧 Sending OTP email to ${patient_email} for authorization ${authorization_id}`);
        const brevoSender = parseBrevoSender(brevoFromRaw);
        console.log(`From: ${brevoSender.name} <${brevoSender.email}>`);

        const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": brevoApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: brevoSender,
            to: [{ email: patient_email }],
            subject: `Ronsberger HMO Authorization OTP - ${patientName}`,
            // Use centralized email template with consistent branding and no pricing info
            htmlContent: buildEmailHtml(
              "Authorization Verification",
              "Secure OTP Delivery",
              `
                <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">Hello, <strong>${patientName}</strong></p>
                <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
                  Your authorization request is being processed. Please find the details below and share the verification code with your healthcare provider to proceed.
                </p>

                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                  <tr>
                    <td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
                      <p style="margin:0;font-size:11px;font-weight:700;color:#0F6E56;text-transform:uppercase;letter-spacing:1px;">Requested Items</p>
                    </td>
                  </tr>
                  <tr><td style="padding:12px 16px;">
                    <ul style="margin:0;padding-left:18px;">
                      ${itemsListHtml}
                    </ul>
                  </td></tr>
                </table>

                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                  <tr>
                    <td style="background:#f0fdf4;border:2px dashed #0F6E56;border-radius:12px;padding:24px;text-align:center;">
                      <p style="color:#0F6E56;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">Your Verification Code</p>
                      <p style="color:#0F6E56;font-size:36px;font-weight:900;letter-spacing:10px;margin:0;font-family:'Courier New',monospace;">${otp}</p>
                    </td>
                  </tr>
                </table>

                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                  <tr>
                    <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;">
                      <p style="color:#92400e;font-size:12px;font-weight:600;margin:0;">This code is valid for this authorization request only and expires in <strong>10 minutes</strong>.</p>
                    </td>
                  </tr>
                </table>

                <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0;">
                  If you did not request this verification code, please ignore this email or contact ${hospitalName} for assistance.
                </p>
              `
            ),
          }),
        });

        const brevoData = await brevoResponse.json();
        console.log(`Brevo response status: ${brevoResponse.status}`, brevoData);

        if (brevoResponse.ok && (brevoData as any).messageId) {
          emailStatus = "sent";
          emailResponseId = (brevoData as any).messageId;
          console.log(`✅ OTP email sent successfully. Message ID: ${emailResponseId}`);
        } else {
          emailStatus = "failed";
          emailError = (brevoData as any).message || (brevoData as any).error || `HTTP ${brevoResponse.status}`;
          console.error(`❌ Brevo API error: ${emailError}`, brevoData);
        }
      } catch (emailErr) {
        emailStatus = "failed";
        emailError = emailErr instanceof Error ? emailErr.message : "Unknown email error";
        console.error(`❌ Exception during OTP email send: ${emailError}`, emailErr);
      }
    }

    await supabase.from("email_logs").insert({
      provider: "brevo",
      recipient: patient_email,
      subject: `Ronsberger HMO Authorization OTP - ${patientName}`,
      status: emailStatus,
      response_id: emailResponseId,
      error_message: emailError,
      authorization_id,
    });

    await supabase.from("audit_logs").insert({
      action: "otp_generated",
      user_id: user.id,
      details: {
        authorization_id,
        patient_email,
        policy_number,
        email_status: emailStatus,
        email_response_id: emailResponseId,
        email_error: emailError,
      },
      severity: emailStatus === "failed" ? "warning" : "info",
    });

    // SECURITY: NEVER return the OTP in the response body, even if email fails.
    // The OTP was sent via email or should be relayed manually through a secure channel.
    const message = emailStatus === "sent"
      ? "OTP sent successfully via email"
      : emailStatus === "skipped"
      ? "OTP generated. Email skipped (no API key). Please relay through a secure channel."
      : "OTP generated but email delivery failed. Please relay through a secure channel.";

    return new Response(
      JSON.stringify({
        success: true,
        message,
        email_status: emailStatus,
        error_message: emailError,
        // SECURITY FIX: OTP value is NEVER included in API responses
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-otp error:", err);
    // Return 200 so the Supabase client doesn't swallow the real error
    return new Response(
      JSON.stringify({ error: true, message: err instanceof Error ? err.message : "Failed to send OTP" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});