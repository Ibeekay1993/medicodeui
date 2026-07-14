import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function parseBrevoSender(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: "Ronsberger HMO", email: raw };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const WASENDER_API_KEY = Deno.env.get("WASENDER_API_KEY");
  const WASENDER_API_URL = "https://wasenderapi.com/api/send-message";
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  const BREVO_FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL") || "Ronsberger HMO <noreply@ronsbergerhmo.com>";

  try {
    const { phone_number, patient_email, patient_name, hospital_name, diagnoses, urgency, requested_items } = await req.json();

    const pName = patient_name ? patient_name.trim() : "Patient";
    const hName = hospital_name || "a hospital";
    const diagnosisText = (diagnoses && diagnoses.length > 0) ? diagnoses.join(", ") : "Not specified";
    const itemsList = (requested_items && requested_items.length > 0) 
      ? requested_items.map((item: Record<string, unknown>) => `- ${item.quantity}x ${item.name}`).join("\n") 
      : "No specific items listed";

    let whatsappSent = false;
    let emailStatus = "skipped";

    // 1. Send WhatsApp Notification
    if (phone_number && WASENDER_API_KEY) {
      const cleanNumber = phone_number.replace(/\D/g, "");
      let formattedNumber = cleanNumber;
      
      if (cleanNumber.length === 11 && cleanNumber.startsWith("0")) {
        formattedNumber = "+234" + cleanNumber.substring(1);
      } else if (cleanNumber.length === 10) {
        formattedNumber = "+234" + cleanNumber;
      } else {
        formattedNumber = "+" + cleanNumber;
      }

      console.log(`Sending WASender submission notification to ${formattedNumber}...`);
      const messageText = `Hello ${pName}!\n\nA new authorization request has just been submitted to Ronsberger HMO on your behalf by ${hName}.\n\n*Diagnosis:* ${diagnosisText}\n*Priority:* ${urgency}\n\n*Requested Services:*\n${itemsList}\n\nWe are currently reviewing this request. You will receive another message with your Arrival PIN as soon as it is approved!\n\nThank you,\n*Ronsberger HMO*`;

      const wasenderPayload = {
        to: formattedNumber,
        text: messageText
      };

      try {
        const response = await fetch(WASENDER_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${WASENDER_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(wasenderPayload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`WASender API error: ${response.status} ${response.statusText}`, errorText);
        } else {
          whatsappSent = true;
        }
      } catch (err) {
        console.error("WhatsApp sending failed:", err);
      }
    }

    // 2. Send Email Notification
    if (patient_email && patient_email !== "no-email@medicode.com" && BREVO_API_KEY) {
      console.log(`Sending submission email to ${patient_email}...`);
      
      const brevoSender = parseBrevoSender(BREVO_FROM_EMAIL);
      const itemsHtml = (requested_items && requested_items.length > 0)
        ? requested_items.map((item: Record<string, unknown>) => `<li>${item.quantity}x ${item.name}</li>`).join("")
        : "<li>No specific items listed</li>";

      const htmlContent = `
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">Hello, <strong>${pName}</strong></p>
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
          A new authorization request has just been submitted to Ronsberger HMO on your behalf by <strong>${hName}</strong>.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#0F6E56;text-transform:uppercase;letter-spacing:1px;">Request Details</p>
          </td></tr>
          <tr><td style="padding:12px 16px;">
            <p style="margin:0;font-size:12px;color:#1E293B;"><strong>Diagnosis:</strong> ${diagnosisText}</p>
            <p style="margin:8px 0 0;font-size:12px;color:#1E293B;"><strong>Priority:</strong> ${urgency}</p>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#0F6E56;text-transform:uppercase;letter-spacing:1px;">Requested Services</p>
          </td></tr>
          <tr><td style="padding:12px 16px;">
            <ul style="margin:0;padding-left:20px;font-size:12px;color:#1E293B;">
              ${itemsHtml}
            </ul>
          </td></tr>
        </table>

        <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0;">
          We are currently reviewing this request. You will receive another message with your Arrival PIN as soon as it is approved.
        </p>
      `;

      try {
        const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            sender: brevoSender,
            to: [{ email: patient_email, name: pName }],
            subject: `Authorization Request Submitted - ${hName}`,
            htmlContent: htmlContent,
          }),
        });

        if (brevoResponse.ok) {
          emailStatus = "sent";
        } else {
          const errText = await brevoResponse.text();
          console.error("Brevo API error:", errText);
          emailStatus = "failed";
        }
      } catch (err) {
        console.error("Email sending failed:", err);
        emailStatus = "failed";
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Notifications processed",
      whatsapp_sent: whatsappSent,
      email_status: emailStatus
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Submission Notification Edge Function Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
