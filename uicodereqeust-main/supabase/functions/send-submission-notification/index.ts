// supabase/functions/send-submission-notification/index.ts
//
// Sends a "request submitted" message to the patient via WhatsApp (Evolution
// transport) and a confirmation email via Brevo. This function historically had
// NO authentication — any caller with the function URL could spam the
// providers. We now require either a Supabase user JWT (allowed roles below)
// or the server-to-server `X-Api-Key` (INTERNAL_API_KEY / MEDAUTH_INTERNAL_API_KEY).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-worker-secret",
};

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const BREVO_FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL") || "Ronsberger HMO <noreply@ronsbergerhmo.com>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY") || Deno.env.get("MEDAUTH_INTERNAL_API_KEY") || "";
const WHATSAPP_WORKER_SECRET = Deno.env.get("WHATSAPP_WORKER_SECRET") || "";
const ALLOWED_ROLES = ["utilization_manager", "admin", "hospital", "claims"];

function parseBrevoSender(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2] };
  return { name: "Ronsberger HMO", email: raw };
}

function bad(status: number, message: string) {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const min = Math.min(a.length, b.length);
  for (let i = 0; i < min; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authenticate(req: Request): Promise<boolean> {
  // Path A: Supabase user JWT (browser / signed-in app).
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error } = await anon.auth.getUser();
    if (error || !user) return false;
    const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: roleRow } = await service
      .from("user_roles")
      .select("role, access_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!roleRow?.role) return false;
    if (String(roleRow.access_status || "active").toLowerCase() !== "active") return false;
    return ALLOWED_ROLES.includes(String(roleRow.role));
  }
  // Path B: server-to-server shared secret.
  const apiKey = req.headers.get("x-api-key") || "";
  const workerSecret = req.headers.get("x-worker-secret") || "";
  if (INTERNAL_API_KEY && constantTimeEqual(apiKey, INTERNAL_API_KEY)) return true;
  if (WHATSAPP_WORKER_SECRET && constantTimeEqual(workerSecret, WHATSAPP_WORKER_SECRET)) return true;
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "method_not_allowed");

  if (!await authenticate(req)) return bad(401, "unauthorized");

  try {
    const { phone_number, patient_email, patient_name, hospital_name, diagnoses, urgency, requested_items } = await req.json();

    const pName = patient_name ? patient_name.trim() : "Patient";
    const hName = hospital_name || "a hospital";
    const diagnosisText = (diagnoses && diagnoses.length > 0) ? diagnoses.join(", ") : "Not specified";
    const itemsList = (requested_items && requested_items.length > 0)
      ? requested_items.map((item: Record<string, unknown>) => `- ${item.quantity}x ${item.name}`).join("\n")
      : "No specific items listed";

    let whatsappSent = false;
    let whatsappError: string | null = null;
    let emailStatus = "skipped";

    // 1. WhatsApp via internal send-whatsapp (Evolution transport)
    if (phone_number) {
      const messageText =
        `Hello ${pName}!\n\nA new authorization request has just been submitted to Ronsberger HMO on your behalf by ${hName}.\n\n` +
        `*Diagnosis:* ${diagnosisText}\n*Priority:* ${urgency}\n\n` +
        `*Requested Services:*\n${itemsList}\n\n` +
        `We are currently reviewing this request. You will receive another message with your Arrival PIN as soon as it is approved!\n\n` +
        `Thank you,\n*Ronsberger HMO*`;
      try {
        // Use the service-role URL to call the sibling function. We pass the
        // shared secret so `send-whatsapp` can authenticate us.
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (INTERNAL_API_KEY) headers["x-api-key"] = INTERNAL_API_KEY;
        else if (WHATSAPP_WORKER_SECRET) headers["x-worker-secret"] = WHATSAPP_WORKER_SECRET;
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers,
          body: JSON.stringify({ phone_number, message: messageText }),
        });
        if (resp.ok) {
          whatsappSent = true;
        } else {
          whatsappError = `send-whatsapp ${resp.status}`;
          console.error("send-submission-notification: WhatsApp send failed", resp.status);
        }
      } catch (err) {
        whatsappError = (err as Error).message || "unknown";
        console.error("WhatsApp sending failed:", whatsappError);
      }
    }

    // 2. Email Notification (Brevo) — unchanged behaviour
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
      whatsapp_error: whatsappError,
      email_status: emailStatus
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Submission Notification Edge Function Error:", error);
    return bad(500, (error as Error)?.message || "internal_error");
  }
});