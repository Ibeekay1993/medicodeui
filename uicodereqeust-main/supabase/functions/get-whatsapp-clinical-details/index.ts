import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser } from "../_shared/auth.ts";

const clinicalRoles = [
  "admin",
  "nurse",
  "utilization_manager",
  "utilization_manager_lead",
  "claims",
];

function cleanField(value: string | undefined) {
  return String(value || "").replace(/^[*_]+|[*_]+$/g, "").trim();
}

function extractLabeledLines(rawMessage: string) {
  const diagnosis: string[] = [];
  const treatment: string[] = [];
  const diagnosisLabel = /^\s*[*_]*\s*(?:clinical\s+diagnosis|diagnosis|clinical\s+complaint|complaint|dx)\s*[*_]*\s*(?::|;|-)\s*(.*?)\s*$/i;
  const treatmentLabel = /^\s*[*_]*\s*(?:services?|drugs?(?:\s*\/\s*treatments?)?|treatments?(?:\s+plan)?(?:\s*\/\s*services?)?|procedures?|investigations?|medications?|prescriptions?|requested\s+(?:treatment|services?))\s*[*_]*\s*(?::|;|-)\s*(.*?)\s*$/i;

  for (const line of rawMessage.split(/\r?\n/)) {
    const diagnosisMatch = line.match(diagnosisLabel);
    if (diagnosisMatch?.[1]) {
      diagnosis.push(cleanField(diagnosisMatch[1]));
      continue;
    }
    const treatmentMatch = line.match(treatmentLabel);
    if (treatmentMatch?.[1]) treatment.push(cleanField(treatmentMatch[1]));
  }

  return {
    diagnosis: diagnosis.filter(Boolean).join("; "),
    treatment: treatment.filter(Boolean).join(", "),
  };
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: true, message: "Method not allowed" }, 405);

  try {
    await validateUser(req, clinicalRoles);
    const body = await req.json();
    const requestId = typeof body?.request_id === "string" ? body.request_id.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return json({ error: true, message: "A valid request id is required" }, 400);
    }

    // First prove the caller can see this request under the normal RLS rules.
    // The service client below is used only after that authorization check and
    // returns the two missing clinical fields, never the raw message.
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: true, message: "Unauthorized" }, 401);
    const scopedClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data: visibleRequest, error: visibilityError } = await scopedClient
      .from("authorization_requests")
      .select("id")
      .eq("id", requestId)
      .maybeSingle();
    if (visibilityError) throw visibilityError;
    if (!visibleRequest) return json({ error: true, message: "Authorization request not found" }, 404);

    const service = getServiceClient();
    const { data: request, error: requestError } = await service
      .from("authorization_requests")
      .select("id,source,diagnosis,treatment,whatsapp_message_id")
      .eq("id", requestId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!request || request.source !== "whatsapp") {
      return json({ error: true, message: "WhatsApp authorization request not found" }, 404);
    }

    const diagnosisFromRecord = String(request.diagnosis || "").trim();
    const treatmentFromRecord = String(request.treatment || "").trim();
    if (diagnosisFromRecord && treatmentFromRecord) {
      return json({ diagnosis: diagnosisFromRecord, treatment: treatmentFromRecord });
    }

    const messageId = String(request.whatsapp_message_id || "").trim();
    if (!messageId) return json({ diagnosis: diagnosisFromRecord, treatment: treatmentFromRecord });

    let { data: message, error: messageError } = await service
      .from("whatsapp_messages")
      .select("message_body,authorization_request_id")
      .eq("message_id", messageId)
      .maybeSingle();
    if (messageError) throw messageError;

    // Older authorization rows may contain the queue row UUID rather than
    // the provider message key. Support that legacy reference securely.
    if (!message && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
      const legacyLookup = await service
        .from("whatsapp_messages")
        .select("message_body,authorization_request_id")
        .eq("id", messageId)
        .maybeSingle();
      message = legacyLookup.data;
      messageError = legacyLookup.error;
      if (messageError) throw messageError;
    }

    // A populated message link must agree with the request being reviewed.
    if (message?.authorization_request_id && message.authorization_request_id !== request.id) {
      return json({ error: true, message: "WhatsApp message is not linked to this authorization" }, 404);
    }

    const recovered = extractLabeledLines(String(message?.message_body || ""));
    return json({
      diagnosis: diagnosisFromRecord || recovered.diagnosis,
      treatment: treatmentFromRecord || recovered.treatment,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load WhatsApp clinical details";
    const status = message === "Unauthorized" ? 401 : message === "Role not permitted" || message === "Account deactivated" || message === "Account setup incomplete" ? 403 : 500;
    return json({ error: true, message }, status);
  }
});
