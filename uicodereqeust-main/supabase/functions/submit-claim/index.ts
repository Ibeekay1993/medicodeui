import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, validateUser } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user, profile } = await validateUser(req, ["hospital"]);
    if (!profile.hospital_id) throw new Error("Hospital profile not found");
    const body = await req.json();
    const requestId = String(body.auth_id || body.request_id || "").trim();
    if (!requestId) throw new Error("Authorization request ID required");

    // Use the caller's JWT so the SECURITY DEFINER RPC still evaluates
    // auth.uid() and the hospital ownership check.  The RPC locks the
    // authorization, claim, lines, and claimed flag in one transaction.
    const authHeader = req.headers.get("x-user-authorization") || req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data, error } = await client.rpc("fn_submit_authorization_claim", {
      p_request_id: requestId,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, ...data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: true,
      message: err instanceof Error ? err.message : "Request failed",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
