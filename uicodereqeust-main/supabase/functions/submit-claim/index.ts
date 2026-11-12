import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/auth.ts";

// Retired: the hospital portal submits claims through the authorization- and
// ownership-checked rpc_submit_new_hospital_claim transaction. Keep this
// function as a clear 410 for stale clients instead of preserving a parallel
// service-role write path.
serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({
    error: true,
    code: "endpoint_retired",
    message: "Claim submission has moved to the authorized hospital portal workflow.",
  }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
