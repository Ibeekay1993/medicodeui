// ============================================================
// COPY EVERYTHING BELOW THIS LINE INTO YOUR SUPABASE DASHBOARD
// Edge Functions → send-otp → Edit → Replace entire code
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser } from "../_shared/auth.ts";

/**
 * send-otp Edge Function (Updated)
 *
 * 1. Validates the user has nurse/admin/hospital/claims role
 * 2. Generates a 6-digit OTP
 * 3. Hashes it with SHA-256
 * 4. Stores hash + plaintext in otp_verifications table
 * 5. Sends OTP via Brevo API with full request details
 *    (diagnosis, services, treatment, drugs - NO amounts)
 * 6. Logs delivery status in email_logs table
 * 7. Logs audit event
 */

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Parse "Name <email>" format into { name, email } for Brevo sender field */
function parseBrevoSender(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  // Fallback: treat entire string as email
  return { name: "Ronsberger HMO", email: raw };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user, profile } = await validateUser(req, ["nurse", "admin", "hospital", "claims"]);
    const supabase = getServiceClient();

    const { authorization_id, patient_email, policy_number } = await req.json();

    if (!authorization_id) throw new Error("authorization_id is required");
    if (!patient_email) throw new Error("patient_email is required");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(patient_email)) {
      throw new Error("Invalid email format");
    }

    const { data: existingOtp } = await supabase
      .from("otp_verifications")
      .select("id, verified, expires_at")
      .eq("authorization_id", authorization_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOtp && existingOtp.verified) {
      return new Response(
        JSON.stringify({ success: true, message: "OTP already verified for this request" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch request details for the email (NO total_amount - patient has no business with the amount)
    const { data: requestData } = await supabase
      .from("authorization_requests")
      .select("patient_name, diagnosis, treatment, hospital_name, urgency")
      .eq("id", authorization_id)
      .maybeSingle();

    const patientName = requestData?.patient_name || "Patient";
    const diagnosis = requestData?.diagnosis || "Not specified";
    const treatment = requestData?.treatment || "Not specified";
    const hospitalName = requestData?.hospital_name || "N/A";
    const urgency = requestData?.urgency || "routine";

    const otp = generateOTP();

    const encoder = new TextEncoder();
    const data = encoder.encode(otp);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const otpHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

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
        email: patient_email,
        expires_at: expiresAt,
        created_by: user.id,
      });

    if (insertError) throw insertError;

    // Send email via Brevo API
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const brevoFromRaw = Deno.env.get("BREVO_FROM_EMAIL") || "Ronsberger HMO OTP <noreply@ronsbergerhmo.com>";

    let emailStatus = "skipped";
    let emailResponseId: string | null = null;
    let emailError: string | null = null;

    if (brevoApiKey) {
      try {
        const brevoSender = parseBrevoSender(brevoFromRaw);
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
            htmlContent: `
              <!DOCTYPE html>
              <html>
              <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
              <body style="margin:0;padding:0;background:#f0f4f3;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f3;padding:32px 16px;">
                  <tr><td align="center">
                    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                      <!-- Header -->
                      <tr>
                        <td style="background:linear-gradient(135deg,#0F6E56 0%,#0a5242 100%);padding:28px 32px;text-align:center;">
                          <div style="margin-bottom:14px;">
                            <img src="https://medicodeui.web.app/ronsberger-logo.png" alt="Ronsberger HMO Logo" width="52" height="52" style="display:inline-block;border-radius:10px;background:rgba(255,255,255,0.15);padding:6px;object-fit:contain;" />
                          </div>
                          <div style="margin-bottom:12px;">
                            <span style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Ronsberger </span><span style="color:#93c34b;font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">HMO</span>
                          </div>
                          <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">Authorization Verification</h1>
                          <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:12px;font-weight:500;letter-spacing:1px;text-transform:uppercase;">Secure OTP Delivery</p>
                        </td>
                      </tr>
                      <!-- Body -->
                      <tr>
                        <td style="padding:32px;">
                          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">Hello, <strong>${patientName}</strong></p>
                          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
                            Your authorization request is being processed. Please find the details below and share the verification code with your healthcare provider to proceed.
                          </p>

                          <!-- Request Details (NO amounts) -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
                            <tr>
                              <td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
                                <p style="margin:0;font-size:11px;font-weight:700;color:#0F6E56;text-transform:uppercase;letter-spacing:1px;">Request Details</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:12px 16px;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td style="padding:4px 0;font-size:12px;color:#64748B;width:40%;">Patient Name</td>
                                    <td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${patientName}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding:4px 0;font-size:12px;color:#64748B;">Policy Number</td>
                                    <td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${policy_number || "N/A"}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding:4px 0;font-size:12px;color:#64748B;">Hospital</td>
                                    <td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${hospitalName}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding:4px 0;font-size:12px;color:#64748B;">Diagnosis</td>
                                    <td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${diagnosis}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding:4px 0;font-size:12px;color:#64748B;">Treatment / Services</td>
                                    <td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${treatment}</td>
                                  </tr>
                                  <tr>
                                    <td style="padding:4px 0;font-size:12px;color:#64748B;">Priority</td>
                                    <td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;text-transform:uppercase;">${urgency}</td>
                                  </tr>
                                  <!-- NOTE: Amount intentionally omitted. Patient has no business with the amount. -->
                                </table>
                              </td>
                            </tr>
                          </table>

                          <!-- OTP Box -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                            <tr>
                              <td style="background:#f0fdf4;border:2px dashed #0F6E56;border-radius:12px;padding:24px;text-align:center;">
                                <p style="color:#0F6E56;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">Your Verification Code</p>
                                <p style="color:#0F6E56;font-size:36px;font-weight:900;letter-spacing:10px;margin:0;font-family:'Courier New',monospace;">${otp}</p>
                              </td>
                            </tr>
                          </table>

                          <!-- Expiry notice -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                            <tr>
                              <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;">
                                <p style="color:#92400e;font-size:12px;font-weight:600;margin:0;">This code is valid for this authorization request only and expires in <strong>10 minutes</strong>. Do not share this code with anyone other than your healthcare provider.</p>
                              </td>
                            </tr>
                          </table>

                          <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0;">
                            If you did not request this verification code, please ignore this email or contact ${hospitalName} for assistance.
                          </p>
                        </td>
                      </tr>
                      <!-- Footer -->
                      <tr>
                        <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
                          <p style="color:#94a3b8;font-size:11px;margin:0 0 4px;letter-spacing:0.5px;">Ronsberger HMO - Clinical Authorization Platform</p>
                          <p style="color:#cbd5e1;font-size:10px;margin:0;">This is an automated message. Please do not reply.</p>
                        </td>
                      </tr>
                    </table>
                  </td></tr>
                </table>
              </body>
              </html>
            `,
          }),
        });

        const brevoData = await brevoResponse.json();

        if (brevoResponse.ok && brevoData.messageId) {
          emailStatus = "sent";
          emailResponseId = brevoData.messageId;
        } else {
          emailStatus = "failed";
          emailError = brevoData.message || brevoData.error || `HTTP ${brevoResponse.status}`;
          console.error("Brevo email failed:", emailError);
        }
      } catch (emailErr) {
        emailStatus = "failed";
        emailError = emailErr instanceof Error ? emailErr.message : "Unknown email error";
        console.error("Brevo email error:", emailErr);
      }
    } else {
      emailStatus = "skipped";
      emailError = "BREVO_API_KEY not configured";
      console.warn("BREVO_API_KEY not set. OTP email not sent.");
    }

    await supabase.from("email_logs").insert({
      provider: "brevo",
      recipient: patient_email,
      subject: `Ronsberger HMO Authorization OTP - ${patientName}`,
      status: emailStatus,
      response_id: emailResponseId,
      error_message: emailError,
      authorization_id,
    }).then(() => {}).catch((err: any) => {
      console.error("Failed to log email:", err);
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
    }).then(() => {}).catch(() => {});

    const message = emailStatus === "sent"
      ? "OTP sent successfully via email"
      : emailStatus === "skipped"
      ? "OTP stored but email skipped (no API key). Please relay OTP manually."
      : "OTP stored but email failed. Please relay OTP manually.";

    return new Response(
      JSON.stringify({
        success: true,
        message,
        email_status: emailStatus,
        otp_value: emailStatus !== "sent" ? otp : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-otp error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Failed to send OTP",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }
});