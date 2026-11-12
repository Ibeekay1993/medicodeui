import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/auth.ts";

// Retired: claim approval is handled through rpc_update_claim_status and
// payments are completed only through the finance batch-settlement workflow.
// Return an explicit status to stale clients; do not keep a direct status-write
// path that can bypass separation of duties.
serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({
    error: true,
    code: "endpoint_retired",
    message: "Use the audited claims workflow and transactional finance batch settlement.",
  }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
