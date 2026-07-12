import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const WASENDER_API_KEY = Deno.env.get("WASENDER_API_KEY");
  const WASENDER_API_URL = "https://wasenderapi.com/api/send-message";

  try {
    const { phone_number, patient_name, hospital_name, diagnoses, urgency, requested_items } = await req.json();

    if (!phone_number) {
      return new Response(JSON.stringify({ error: "Missing phone_number" }), {
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

    // Format phone number
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

    const pName = patient_name ? patient_name.trim() : "Patient";
    const hName = hospital_name || "a hospital";
    const diagnosisText = (diagnoses && diagnoses.length > 0) ? diagnoses.join(", ") : "Not specified";
    const itemsList = (requested_items && requested_items.length > 0) 
      ? requested_items.map((item: any) => `- ${item.quantity}x ${item.name}`).join("\n") 
      : "No specific items listed";

    const messageText = `Hello ${pName}!\n\nA new authorization request has just been submitted to Ronsberger HMO on your behalf by ${hName}.\n\n*Diagnosis:* ${diagnosisText}\n*Priority:* ${urgency}\n\n*Requested Services:*\n${itemsList}\n\nWe are currently reviewing this request. You will receive another message with your Arrival PIN as soon as it is approved!`;

    const wasenderPayload = {
      to: formattedNumber,
      text: messageText
    };

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
      throw new Error(`Failed to send WhatsApp message: ${errorText}`);
    }

    return new Response(JSON.stringify({ success: true, message: "Notification sent via WASender" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Submission Notification Edge Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
