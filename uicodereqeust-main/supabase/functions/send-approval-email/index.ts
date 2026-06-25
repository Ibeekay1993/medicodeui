// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser, parseBrevoSender } from "../_shared/auth.ts";
import {
  buildEmailHtml,
  extractServiceName,
  detailsRow,
  stripCodesAndPricing,
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

    const { user } = await validateUser(req, ["utilization_manager", "admin", "hospital", "claims"]);
    const supabase = getServiceClient();

    const body = await req.json().catch(() => ({}));
    const { authorization_id } = body as { authorization_id?: string | number };

    if (!authorization_id) throw new Error("authorization_id is required");

    const { data: request, error: fetchError } = await supabase
      .from("authorization_requests")
      .select(
        "patient_name, patient_email, diagnosis, treatment, hospital_name, authorization_code, policy_number, urgency, approved_items, referred_hospital_name"
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
        JSON.stringify({ success: true, message: "Skipped approval email for placeholder address" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const patientName = request.patient_name || "Patient";
    const diagnosis = request.diagnosis || "Not specified";
    const hospitalName = request.hospital_name || "N/A";
    const policyNumber = request.policy_number || "N/A";
    const urgency = request.urgency || "routine";
    const referredHospital = request.referred_hospital_name || null;

    // ── Build approved services list (patient-safe: no codes, no pricing) ──────
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
              `<tr>
                <td style="padding:6px 0;font-size:12px;color:#1E293B;font-weight:700;">${name}</td>
              </tr>`
          )
          .join("")
      : `<tr><td style="padding:6px 0;font-size:12px;color:#64748B;font-style:italic;">No services listed</td></tr>`;

    // ── Build the email body using the centralized template ───────────────────
    const bodyHtml = `
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">Hello, <strong>${patientName}</strong></p>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Your treatment request has been approved. You do not need to present any approval code at reception.
        The approved hospital has been notified and will confirm your approved services with Ronsberger HMO.
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
            ${detailsRow("Priority", urgency.toUpperCase())}
            ${referredHospital ? detailsRow("Referral To", referredHospital) : ""}
          </table>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#0F6E56;text-transform:uppercase;letter-spacing:1px;">Approved Services</p>
        </td></tr>
        <tr><td style="padding:12px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${servicesListHtml}
          </table>
        </td></tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          <td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;">
            <p style="color:#1e40af;font-size:12px;font-weight:600;margin:0;">
              If you have not requested this treatment, please contact
              <a href="mailto:ronsbergercallcentre@gmail.com" style="color:#1e40af;">ronsbergercallcentre@gmail.com</a>
              or call <strong>08083366550</strong>.
            </p>
          </td>
        </tr>
      </table>

      <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0;">
        Your approved hospital will confirm your approved services directly with Ronsberger HMO.
      </p>
    `;

    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const brevoFromRaw = Deno.env.get("BREVO_FROM_EMAIL") || "Ronsberger HMO <noreply@ronsbergerhmo.com>";

    let emailStatus = "skipped";
    let emailResponseId: string | null = null;
    let emailError: string | null = null;

    if (!brevoApiKey) {
      console.warn("⚠️ BREVO_API_KEY not configured - approval email will not be sent");
      emailStatus = "skipped";
      emailError = "BREVO_API_KEY not configured";
    } else {
      try {
        console.log(`📧 Sending approval email to ${patientEmail} for authorization ${authorization_id}`);
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
            subject: `Authorization Approved — ${patientName}`,
            htmlContent: buildEmailHtml(
              "Authorization Approved",
              "Your request has been approved",
              bodyHtml
            ),
          }),
        });

        const brevoData = await brevoResponse.json();
        console.log(`Brevo response status: ${brevoResponse.status}`, brevoData);

        if (brevoResponse.ok && (brevoData as any).messageId) {
          emailStatus = "sent";
          emailResponseId = (brevoData as any).messageId;
          console.log(`✅ Approval email sent successfully. Message ID: ${emailResponseId}`);
        } else {
          emailStatus = "failed";
          emailError = (brevoData as any).message || (brevoData as any).error || `HTTP ${brevoResponse.status}`;
          console.error(`❌ Brevo API error: ${emailError}`, brevoData);
        }
      } catch (emailErr) {
        emailStatus = "failed";
        emailError = emailErr instanceof Error ? emailErr.message : "Unknown email error";
        console.error(`❌ Exception during approval email send: ${emailError}`, emailErr);
      }
    }

    await supabase.from("email_logs").insert({
      provider: "brevo",
      recipient: patientEmail,
      subject: `Authorization Approved — ${patientName}`,
      status: emailStatus,
      response_id: emailResponseId,
      error_message: emailError,
      authorization_id,
    }).catch(() => {});

    await supabase.from("audit_logs").insert({
      action: "approval_email_sent",
      user_id: user.id,
      details: {
        authorization_id,
        patient_email: patientEmail,
        email_status: emailStatus,
      },
      severity: emailStatus === "failed" ? "warning" : "info",
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        message: emailStatus === "sent" ? "Approval email sent" : "Approval email skipped or failed",
        email_status: emailStatus,
        error_message: emailError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-approval-email error:", err);
    return new Response(
      JSON.stringify({ error: true, message: err instanceof Error ? err.message : "Failed to send approval email" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
