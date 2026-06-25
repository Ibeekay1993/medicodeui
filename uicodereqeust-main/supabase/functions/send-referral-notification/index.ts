// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser, parseBrevoSender } from "../_shared/auth.ts";
import {
  buildEmailHtml,
  detailsRow,
  extractServiceName,
  stripCodesAndPricing,
  REFERRAL_CONFIG,
} from "../_shared/email-template.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      });
    }

    const { user } = await validateUser(req, ["nurse", "admin", "hospital", "claims"]);
    const supabase = getServiceClient();

    const body = await req.json().catch(() => ({}));
    const { authorization_id } = body as { authorization_id?: string | number };

    if (!authorization_id) throw new Error("authorization_id is required");

    const { data: request, error: fetchError } = await supabase
      .from("authorization_requests")
      .select(
        "patient_name, patient_email, diagnosis, treatment, hospital_name, policy_number, urgency, referred_hospital_name, authorization_code, approved_items"
      )
      .eq("id", authorization_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!request) throw new Error("Request not found");

    const patientEmail = request.patient_email;
    if (!patientEmail) {
      return new Response(
        JSON.stringify({ success: false, message: "No patient email on file" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const patientName = request.patient_name || "Patient";
    const diagnosis = request.diagnosis || "Not specified";
    const hospitalName = request.hospital_name || "N/A";
    const policyNumber = request.policy_number || "N/A";
    const urgency = request.urgency || "routine";
    const referredHospital = request.referred_hospital_name || "To be confirmed";

    // Build patient-safe approved services list
    let serviceItems: string[] = [];
    if (Array.isArray(request.approved_items) && request.approved_items.length > 0) {
      serviceItems = request.approved_items
        .map((item: any) => extractServiceName(item))
        .filter(Boolean);
    } else if (request.treatment) {
      serviceItems = String(request.treatment)
        .split(";")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .map((item: string) => stripCodesAndPricing(item))
        .filter(Boolean);
    }

    const servicesListHtml = serviceItems.length
      ? serviceItems
          .map(
            (name) =>
              `<li style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${name}</li>`
          )
          .join("")
      : `<li style="padding:4px 0;font-size:12px;color:#64748B;font-style:italic;">Services to be confirmed at receiving hospital</li>`;

    const bodyHtml = `
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">Hello, <strong>${patientName}</strong></p>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Your treatment has been approved and you have been referred to a specialist hospital for further care.
        Please report to the receiving hospital at your earliest convenience with a valid ID and your policy card.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#0F6E56;text-transform:uppercase;letter-spacing:1px;">Referral Details</p>
        </td></tr>
        <tr><td style="padding:12px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${detailsRow("Patient", patientName)}
            ${detailsRow("Policy No.", policyNumber)}
            ${detailsRow("Referring Hospital", hospitalName)}
            ${detailsRow("Receiving Hospital", referredHospital)}
            ${detailsRow("Diagnosis", diagnosis)}
            ${detailsRow("Priority", urgency.toUpperCase())}
          </table>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#0F6E56;text-transform:uppercase;letter-spacing:1px;">Approved Services</p>
        </td></tr>
        <tr><td style="padding:12px 16px;">
          <ul style="margin:0;padding-left:18px;">
            ${servicesListHtml}
          </ul>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr>
          <td style="background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:16px;">
            <p style="color:#166534;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px;">What to bring</p>
            <ul style="color:#14532d;font-size:12px;margin:0;padding-left:18px;line-height:1.8;">
              <li>Valid government-issued ID</li>
              <li>Ronsberger HMO policy card</li>
              <li>This email (printed or on your phone)</li>
              <li>Any referral documents from your doctor</li>
            </ul>
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;">
            <p style="color:#92400e;font-size:12px;font-weight:600;margin:0;">
              An OTP verification code will be required when you arrive at <strong>${referredHospital}</strong>.
              This code will be provided to you separately and is valid for 10 minutes.
            </p>
          </td>
        </tr>
      </table>

      <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0;">
        Questions? Contact us at
        <a href="mailto:ronsbergercallcentre@gmail.com" style="color:#0F6E56;">ronsbergercallcentre@gmail.com</a>
        or call <strong>08083366550</strong>.
      </p>
    `;

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const brevoFromRaw = Deno.env.get("BREVO_FROM_EMAIL") || "Ronsberger HMO <noreply@ronsbergerhmo.com>";

    let emailStatus = "skipped";
    let emailResponseId: string | null = null;
    let emailError: string | null = null;

    if (!brevoApiKey) {
      console.warn("⚠️ BREVO_API_KEY not configured - referral notification email will not be sent");
      emailStatus = "skipped";
      emailError = "BREVO_API_KEY not configured";
    } else {
      try {
        console.log(`📧 Sending referral notification to ${patientEmail} for authorization ${authorization_id}`);
        const brevoSender = parseBrevoSender(brevoFromRaw);

        const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": brevoApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: brevoSender,
            to: [{ email: patientEmail }],
            subject: `Referral Approved — ${patientName}`,
            htmlContent: buildEmailHtml(
              "Referral Approved",
              "You have been referred to a specialist hospital",
              bodyHtml,
              REFERRAL_CONFIG
            ),
          }),
        });

        const brevoData = await brevoResponse.json();
        console.log(`Brevo response status: ${brevoResponse.status}`, brevoData);

        if (brevoResponse.ok && (brevoData as any).messageId) {
          emailStatus = "sent";
          emailResponseId = (brevoData as any).messageId;
          console.log(`✅ Referral notification sent successfully. Message ID: ${emailResponseId}`);
        } else {
          emailStatus = "failed";
          emailError = (brevoData as any).message || (brevoData as any).error || `HTTP ${brevoResponse.status}`;
          console.error(`❌ Brevo API error: ${emailError}`, brevoData);
        }
      } catch (emailErr) {
        emailStatus = "failed";
        emailError = emailErr instanceof Error ? emailErr.message : "Unknown email error";
        console.error(`❌ Exception during referral notification send: ${emailError}`, emailErr);
      }
    }

    await supabase.from("email_logs").insert({
      provider: "brevo",
      recipient: patientEmail,
      subject: `Referral Approved — ${patientName}`,
      status: emailStatus,
      response_id: emailResponseId,
      error_message: emailError,
      authorization_id,
    }).catch(() => {});

    await supabase.from("audit_logs").insert({
      action: "referral_notification_sent",
      user_id: user.id,
      details: {
        authorization_id,
        patient_email: patientEmail,
        referred_hospital: referredHospital,
        email_status: emailStatus,
      },
      severity: emailStatus === "failed" ? "warning" : "info",
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: emailStatus === "sent" ? "Referral notification sent" : "Referral notification skipped or failed",
        email_status: emailStatus,
        error_message: emailError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-referral-notification error:", err);
    return new Response(
      JSON.stringify({ error: true, message: err instanceof Error ? err.message : "Failed to send referral notification" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
