// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser, parseBrevoSender } from "../_shared/auth.ts";
import {
  buildEmailHtml,
  detailsRow,
  stripCodesAndPricing,
  REJECTION_CONFIG,
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
        "patient_name, patient_email, diagnosis, treatment, hospital_name, policy_number, urgency, decision_reason, clinical_notes"
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

    if (patientEmail === "no-email@medicode.com") {
      return new Response(
        JSON.stringify({ success: true, message: "Skipped rejection email for placeholder address" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const patientName = request.patient_name || "Patient";
    const diagnosis = request.diagnosis || "Not specified";
    const hospitalName = request.hospital_name || "N/A";
    const policyNumber = request.policy_number || "N/A";
    // Use decision_reason for patient-facing message; never expose internal clinical notes verbatim
    const declineReason = request.decision_reason || "Your request did not meet the current authorization criteria.";

    // Build the email body using the centralized template
    // NOTE: The rejection email uses a warm, supportive tone and omits any internal
    // clinical details, codes, or pricing. Only the readable decline reason is shown.
    const bodyHtml = `
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">Hello, <strong>${patientName}</strong></p>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
        We regret to inform you that your treatment authorization request has not been approved at this time.
        Please review the details below and contact your hospital or Ronsberger HMO if you have any questions.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#0F6E56;text-transform:uppercase;letter-spacing:1px;">Request Details</p>
        </td></tr>
        <tr><td style="padding:12px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${detailsRow("Patient", patientName)}
            ${detailsRow("Policy No.", policyNumber)}
            ${detailsRow("Hospital", hospitalName)}
            ${detailsRow("Diagnosis", diagnosis)}
          </table>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr>
          <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;">
            <p style="color:#991b1b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px;">Reason for Decline</p>
            <p style="color:#7f1d1d;font-size:13px;font-weight:600;margin:0;line-height:1.6;">${declineReason}</p>
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;">
            <p style="color:#92400e;font-size:12px;font-weight:600;margin:0 0 4px;">What can you do?</p>
            <ul style="color:#92400e;font-size:12px;margin:0;padding-left:18px;line-height:1.8;">
              <li>Contact your attending physician for an appeal or alternative treatment plan</li>
              <li>Call Ronsberger HMO at <strong>08083366550</strong> to discuss this decision</li>
              <li>Email us at <a href="mailto:ronsbergercallcentre@gmail.com" style="color:#92400e;">ronsbergercallcentre@gmail.com</a></li>
            </ul>
          </td>
        </tr>
      </table>

      <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0;">
        If you believe this decision was made in error, please contact your hospital or Ronsberger HMO immediately.
        This notice is for informational purposes only.
      </p>
    `;

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const brevoFromRaw = Deno.env.get("BREVO_FROM_EMAIL") || "Ronsberger HMO <noreply@ronsbergerhmo.com>";

    let emailStatus = "skipped";
    let emailResponseId: string | null = null;
    let emailError: string | null = null;

    if (!brevoApiKey) {
      console.warn("⚠️ BREVO_API_KEY not configured - rejection email will not be sent");
      emailStatus = "skipped";
      emailError = "BREVO_API_KEY not configured";
    } else {
      try {
        console.log(`📧 Sending rejection email to ${patientEmail} for authorization ${authorization_id}`);
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
            subject: `Authorization Update — ${patientName}`,
            htmlContent: buildEmailHtml(
              "Authorization Update",
              "Regarding your recent request",
              bodyHtml,
              REJECTION_CONFIG
            ),
          }),
        });

        const brevoData = await brevoResponse.json();
        console.log(`Brevo response status: ${brevoResponse.status}`, brevoData);

        if (brevoResponse.ok && (brevoData as any).messageId) {
          emailStatus = "sent";
          emailResponseId = (brevoData as any).messageId;
          console.log(`✅ Rejection email sent successfully. Message ID: ${emailResponseId}`);
        } else {
          emailStatus = "failed";
          emailError = (brevoData as any).message || (brevoData as any).error || `HTTP ${brevoResponse.status}`;
          console.error(`❌ Brevo API error: ${emailError}`, brevoData);
        }
      } catch (emailErr) {
        emailStatus = "failed";
        emailError = emailErr instanceof Error ? emailErr.message : "Unknown email error";
        console.error(`❌ Exception during rejection email send: ${emailError}`, emailErr);
      }
    }

    await supabase.from("email_logs").insert({
      provider: "brevo",
      recipient: patientEmail,
      subject: `Authorization Update — ${patientName}`,
      status: emailStatus,
      response_id: emailResponseId,
      error_message: emailError,
      authorization_id,
    }).catch(() => {});

    await supabase.from("audit_logs").insert({
      action: "rejection_email_sent",
      user_id: user.id,
      details: {
        authorization_id,
        patient_email: patientEmail,
        email_status: emailStatus,
        decline_reason: declineReason,
      },
      severity: emailStatus === "failed" ? "warning" : "info",
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: emailStatus === "sent" ? "Rejection email sent" : "Rejection email skipped or failed",
        email_status: emailStatus,
        error_message: emailError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-rejection-email error:", err);
    return new Response(
      JSON.stringify({ error: true, message: err instanceof Error ? err.message : "Failed to send rejection email" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
