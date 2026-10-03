import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WASENDER_API_URL = Deno.env.get("WASENDER_API_URL") || "https://wasenderapi.com/api/send-message";
const WASENDER_API_KEY = Deno.env.get("WASENDER_API_KEY") || "";

function constantTimeEqual(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // This endpoint sends a patient PIN and is only called from the trusted
  // send-approval-email Edge Function using its service-role client. Requiring
  // that credential prevents any signed-in user from messaging arbitrary
  // phone numbers or choosing an OTP themselves.
  const expectedServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearerToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expectedServiceKey || !constantTimeEqual(bearerToken, expectedServiceKey)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { phone_number, otp_code, hospital_name, patient_name, diagnosis, items } = await req.json();

    if (!phone_number || !otp_code) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!WASENDER_API_KEY) {
      console.warn("WASender API key not configured. Skipping WhatsApp send.");
      return new Response(JSON.stringify({ success: false, message: "WhatsApp credentials missing" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Format phone number to WhatsApp international format (with + symbol for WASender)
    const cleanNumber = phone_number.replace(/\D/g, "");
    let formattedNumber = cleanNumber;
    
    // If it's a Nigerian 11-digit number starting with 0 (e.g. 080...), replace 0 with 234
    if (cleanNumber.length === 11 && cleanNumber.startsWith("0")) {
      formattedNumber = "+234" + cleanNumber.substring(1);
    } 
    // If it's 10 digits (missing the leading 0), prepend +234
    else if (cleanNumber.length === 10) {
      formattedNumber = "+234" + cleanNumber;
    } else {
      // WASender usually prefers a + at the start
      formattedNumber = "+" + cleanNumber;
    }

    console.log(`Sending WASender WhatsApp message to ${formattedNumber}...`);

    const pName = patient_name ? patient_name.trim() : "Patient";
    const hName = hospital_name || "the hospital";
    const diag = diagnosis ? `\n*Diagnosis:* ${diagnosis}` : "";
    
    let itemsText = "";
    if (items && Array.isArray(items) && items.length > 0) {
      itemsText = "\n\n*Requested Services:*\n" + items.map((item: Record<string, unknown>) => {
        const qty = item.quantity || 1;
        const name = item.name || "Service";
        if (item.declined) {
          return `~${qty}x ${name}~ (Rejected)`;
        }
        return `✅ ${qty}x ${name}`;
      }).join("\n");
    }

    const messageText = `Hello ${pName}!\n\nA new authorization request has been approved for you at ${hName}.${diag}${itemsText}\n\nYour Arrival PIN is: *${otp_code}*\n\nThank you,\n*Ronsberger HMO*`;

    const wasenderPayload = {
      to: formattedNumber,
      text: messageText
    };

    const response = await fetch(WASENDER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WASENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(wasenderPayload),
    });

    // WASender might not return standard JSON, so we handle safely
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }

    if (!response.ok) {
      console.error("WASender API Error:", result);
      return new Response(
        JSON.stringify({
          error: "Failed to send WhatsApp message via WASender API",
          details: result,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("WASender WhatsApp message sent successfully.");

    return new Response(
      JSON.stringify({
        success: true,
        message: "WhatsApp message delivered via WASender API",
        method: "whatsapp"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Internal Function Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
