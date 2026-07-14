import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser, parseBrevoSender } from "../_shared/auth.ts";
import {
  buildEmailHtml,
  extractServiceName,
  detailsRow,
  stripCodesAndPricing,
} from "../_shared/email-template.ts";

async function generateUniquePIN(supabase: SupabaseClient): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed O, 0, 1, I
  let attempts = 0;
  while (attempts < 10) {
    let pin = "";
    const array = new Uint8Array(6);
    crypto.getRandomValues(array);
    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line security/detect-object-injection
      pin += chars[array[i] % chars.length];
    }
    
    const { data, error } = await supabase
      .from("otp_verifications")
      .select("id")
      .eq("otp_value", pin)
      .eq("verified", false)
      .maybeSingle();
      
    if (!data && !error) return pin;
    attempts++;
  }
  throw new Error("Failed to generate a unique PIN after 10 attempts");
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
        "patient_name, patient_email, patient_phone, diagnosis, treatment, hospital_name, hospital_id, authorization_code, policy_number, urgency, approved_items, referred_hospital_name, referred_hospital_id"
      )
      .eq("id", authorization_id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!request) throw new Error("Request not found");

    const patientEmail = request.patient_email;
    const safeEmail = patientEmail || "no-email@medicode.com";

    const { data: existingOtp } = await supabase
      .from("otp_verifications")
      .select("id, expires_at, otp_value, otp_type, verified, consumed_at")
      .eq("authorization_id", authorization_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let otp = existingOtp?.otp_value || null;
    let pinCreated = false;

    if (!otp) {
      otp = await generateUniquePIN(supabase);
      pinCreated = true;
      const otpHash = await sha256Hex(otp);
      const expiresAt = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString();
      const claimingHospitalId = request.referred_hospital_id || request.hospital_id;

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
          otp_type: "ARRIVAL",
          hospital_id: claimingHospitalId,
        });

      if (insertError) throw insertError;
    }

    // Trigger WhatsApp Notification if phone number exists
    if (request.patient_phone && otp) {
      console.log(`Triggering WhatsApp PIN for ${request.patient_phone}`);
      // We don't await this so it doesn't block the email
      supabase.functions.invoke("send-whatsapp-otp", {
        body: {
          phone_number: request.patient_phone,
          otp_code: otp,
          hospital_name: request.hospital_name || "the hospital",
          patient_name: request.patient_name || "Patient",
          authorization_request_id: authorization_id,
          diagnosis: request.diagnosis || "",
          items: request.approved_items || []
        }
      }).catch(err => console.error("WhatsApp trigger failed:", err));
    }

    if (safeEmail === "no-email@medicode.com") {
      return new Response(
        JSON.stringify({ success: true, message: pinCreated ? "WhatsApp triggered; PIN generated; approval email skipped for placeholder address." : "WhatsApp triggered; Existing PIN reused; approval email skipped for placeholder address." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const patientName = request.patient_name || "Patient";
    const diagnosis = request.diagnosis || "Not specified";
    const hospitalName = request.hospital_name || "N/A";
    const policyNumber = request.policy_number || "N/A";
    const urgency = request.urgency || "routine";
    const referredHospital = request.referred_hospital_name || null;

    let serviceItems: string[] = [];

    if (Array.isArray(request.approved_items) && request.approved_items.length > 0) {
      serviceItems = request.approved_items
        .map((item: Record<string, unknown>) => {
          const qty = item.quantity || 1;
          const name = item.name || extractServiceName(item);
          if (item.declined) {
            return `<del style="color:#ef4444;">${qty}x ${name}</del> <span style="color:#ef4444;font-size:10px;font-weight:bold;">(Rejected)</span>`;
          }
          return `&#10003; ${qty}x ${name}`;
        })
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

    const bodyHtml = `
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">Hello, <strong>${patientName}</strong></p>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Your treatment request has been <strong>approved</strong> by Ronsberger HMO.
      </p>

      <div style="background-color:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:20px; text-align:center; margin-bottom:24px;">
        <p style="color:#166534; font-size:14px; font-weight:600; margin:0 0 8px;">Your Authorization OTP:</p>
        <div style="font-size:32px; font-weight:900; letter-spacing:4px; color:#14532d; font-family:monospace;">
          ${otp}
        </div>
        <p style="color:#15803d; font-size:13px; margin:12px 0 0 0; line-height:1.5;">
          Please provide this secure OTP to the reception at your approved hospital to authorize and finalize your treatment.
        </p>
      </div>

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
      console.warn("BREVO_API_KEY not configured - approval email will not be sent");
      emailStatus = "skipped";
      emailError = "BREVO_API_KEY not configured";
    } else {
      try {
        console.log(`Sending approval email to ${safeEmail} for authorization ${authorization_id}`);
        const brevoSender = parseBrevoSender(brevoFromRaw);

        const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": brevoApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: brevoSender,
            to: [{ email: safeEmail }],
            subject: `Authorization Approved - ${patientName}`,
            htmlContent: buildEmailHtml(
              "Authorization Approved",
              "Your request has been approved",
              bodyHtml
            ),
          }),
        });

        const brevoData = await brevoResponse.json();
        console.log(`Brevo response status: ${brevoResponse.status}`, brevoData);

        if (brevoResponse.ok && (brevoData as Record<string, unknown>).messageId) {
          emailStatus = "sent";
          emailResponseId = String((brevoData as Record<string, unknown>).messageId);
          console.log(`Approval email sent successfully. Message ID: ${emailResponseId}`);
        } else {
          emailStatus = "failed";
          emailError = String((brevoData as Record<string, unknown>).message || (brevoData as Record<string, unknown>).error || `HTTP ${brevoResponse.status}`);
          console.error(`Brevo API error: ${emailError}`, brevoData);
        }
      } catch (emailErr) {
        emailStatus = "failed";
        emailError = emailErr instanceof Error ? emailErr.message : "Unknown email error";
        console.error(`Exception during approval email send: ${emailError}`, emailErr);
      }
    }

    await supabase.from("email_logs").insert({
      provider: "brevo",
      recipient: safeEmail,
      subject: `Authorization Approved - ${patientName}`,
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
        patient_email: safeEmail,
        email_status: emailStatus,
        pin_created: pinCreated,
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});