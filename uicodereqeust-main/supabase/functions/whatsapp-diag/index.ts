// /supabase/functions/whatsapp-diag/index.ts
//
// Diagnostic probe for the WhatsApp pipeline. NEVER echoes secret values.
// Auth: requires `x-diag-token` matching the SHA-256 of an expected token,
//      or service-role JWT. The expected token is itself read from an env
//      var (DIAG_TOKEN) and compared in constant time.
//
// Returns JSON with:
//   - env_fingerprint: { name, present, sha256, length } for each secret
//   - queue:           latest N rows from whatsapp_messages
//   - authorizations:  latest N rows from authorization_requests
//   - versions:        deployed code fingerprints (sha256 of self)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-diag-token",
};

const DIAG_TOKEN = Deno.env.get("DIAG_TOKEN") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const SECRET_VARS = [
  "EVOLUTION_WEBHOOK_TOKEN",
  "EVOLUTION_API_KEY",
  "EVOLUTION_API_URL",
  "EVOLUTION_INSTANCE_NAME",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "WHATSAPP_WORKER_SECRET",
  "MEDAUTH_INTERNAL_API_KEY",
  "INTERNAL_API_KEY",
  "WHATSAPP_MAX_ATTEMPTS",
  "WHATSAPP_WORKER_BATCH",
  "DIAG_TOKEN",
];

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ctEq(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const min = Math.min(a.length, b.length);
  for (let i = 0; i < min; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    SERVICE_KEY,
    { auth: { persistSession: false } },
  );
}

function bad(status: number, message: string) {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return bad(405, "method_not_allowed");

  // Auth
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const isService = !!SERVICE_KEY && bearer === SERVICE_KEY;
  const gotDiag = req.headers.get("x-diag-token") || "";
  if (!isService) {
    if (!DIAG_TOKEN || !ctEq(gotDiag, DIAG_TOKEN)) return bad(401, "unauthorized");
  }

  // 1) Secret fingerprints
  const envFp: Record<string, { present: boolean; sha256: string; length: number }> = {};
  for (const name of SECRET_VARS) {
    const v = Deno.env.get(name) || "";
    envFp[name] = {
      present: v.length > 0,
      sha256: await sha256Hex(v),
      length: v.length,
    };
  }

  const supabase = getServiceClient();

  // 2) Latest 20 queue rows
  const { data: queue, error: qErr } = await supabase
    .from("whatsapp_messages")
    .select(
      "message_id, phone_number, message_type, status, attempts, last_error, internal_request_id, template_sent_at, received_at, status_updated_at, error_message",
    )
    .order("received_at", { ascending: false })
    .limit(20);

  // 3) Latest 20 authorizations
  const { data: auths, error: aErr } = await supabase
    .from("authorization_requests")
    .select("id, patient_name, policy_number, diagnosis, status, source, whatsapp_raw_message, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  // 4) Code fingerprint — the deployed file itself
  const selfPath = new URL("./index.ts", import.meta.url).pathname;
  let codeSha = "";
  try {
    const src = await Deno.readTextFile(selfPath);
    codeSha = await sha256Hex(src);
  } catch (e) {
    codeSha = `read_error:${(e as Error).message}`;
  }

  return new Response(
    JSON.stringify(
      {
        ok: true,
        project: Deno.env.get("SUPABASE_URL") || "",
        env_fingerprint: envFp,
        queue: { error: qErr?.message || null, rows: queue || [] },
        authorizations: { error: aErr?.message || null, rows: auths || [] },
        code_fingerprint: { "whatsapp-diag/index.ts": codeSha },
      },
      null,
      2,
    ),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
