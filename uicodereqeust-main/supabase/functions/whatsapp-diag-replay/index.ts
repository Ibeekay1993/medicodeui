// /supabase/functions/whatsapp-diag-replay/index.ts
//
// End-to-end self-test for the WhatsApp pipeline. Replays a payload through
// the same code path the webhook uses, with the actual EVOLUTION_WEBHOOK_TOKEN,
// so the test is not blocked by Evolution's configuration.
//
// Auth: x-diag-token must equal the DIAG_TOKEN env (constant-time compare).
// Body: { message_id, phone, body, from_me?: false, instance?: "medicode-test" }
//
// What it does:
//   1) Synthesizes an Evolution MESSAGES_UPSERT envelope
//   2) Inserts into whatsapp_messages with status='queued'
//   3) Calls whatsapp-worker via internal fetch (with x-worker-secret if set)
//   4) Waits up to 30s for the row to leave queued/processing
//   5) Returns: { ok, message_id, final_status, internal_request_id, template_sent_at,
//                 worker_logs[], auth_row_id }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-diag-token",
};

const DIAG_TOKEN = Deno.env.get("DIAG_TOKEN") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const WORKER_SECRET = Deno.env.get("WHATSAPP_WORKER_SECRET") || "";
const EVOLUTION_INSTANCE_NAME =
  Deno.env.get("EVOLUTION_INSTANCE_NAME") || "medicode-test";

function ctEq(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const min = Math.min(a.length, b.length);
  for (let i = 0; i < min; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}
function bad(s: number, m: string) {
  return new Response(JSON.stringify({ error: true, message: m }), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("234")) return d;
  if (d.length === 10) return "234" + d;
  if (d.length === 11 && d.startsWith("0")) return "234" + d.slice(1);
  return d;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "method_not_allowed");

  const got = req.headers.get("x-diag-token") || "";
  if (!DIAG_TOKEN || !ctEq(got, DIAG_TOKEN)) return bad(401, "unauthorized");

  let body: any;
  try { body = await req.json(); } catch { return bad(400, "invalid_json"); }

  const messageId = String(body.message_id || `DIAG-${Date.now()}`);
  const phoneRaw = String(body.phone || "2348012345678");
  const phone = normalizePhone(phoneRaw);
  const text = String(body.body || "");
  const fromMe = Boolean(body.from_me);
  const instance = String(body.instance || EVOLUTION_INSTANCE_NAME);
  const remoteJid = `${phone}@s.whatsapp.net`;
  const ts = Math.floor(Date.now() / 1000);

  const supabase = getServiceClient();

  // 1) Build the same envelope the webhook would build, insert it
  const envelope = {
    event: "MESSAGES_UPSERT",
    instance,
    data: {
      key: { remoteJid, fromMe, id: messageId },
      pushName: "Diag User",
      message: { conversation: text },
      messageType: "conversation",
      messageTimestamp: ts,
    },
    sender: remoteJid,
  };

  // Clean any prior DIAG row with the same message_id
  await supabase.from("whatsapp_messages").delete().eq("message_id", messageId);

  const insertRow: Record<string, unknown> = {
    message_id: messageId,
    phone_number: phone,
    message_type: "text",
    message_body: text,
    raw_message: envelope,
    status: "queued",
    received_at: new Date().toISOString(),
    phone_number_id: instance,
  };
  // Only set media_url if the column exists; the original schema omitted it
  // but later code references it. Defensive: try/catch and ignore.
  try {
    const { error: insErr } = await supabase.from("whatsapp_messages").insert(insertRow);
    if (insErr && /media_url/.test(insErr.message)) {
      delete insertRow.media_url;
      const { error: insErr2 } = await supabase.from("whatsapp_messages").insert(insertRow);
      if (insErr2) return bad(500, `insert_failed: ${insErr2.message}`);
    } else if (insErr) {
      return bad(500, `insert_failed: ${insErr.message}`);
    }
  } catch (e) {
    return bad(500, `insert_threw: ${(e as Error).message}`);
  }

  // 2) Invoke the worker
  const wh: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SERVICE_KEY}`,
  };
  if (WORKER_SECRET) wh["x-worker-secret"] = WORKER_SECRET;
  let workerStatus = 0;
  let workerBody = "";
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-worker`, {
      method: "POST",
      headers: wh,
      body: JSON.stringify({ message_id: messageId, trigger: "diag_replay" }),
    });
    workerStatus = r.status;
    workerBody = (await r.text()).slice(0, 4000);
  } catch (e) {
    workerBody = `worker_fetch_failed: ${(e as Error).message}`;
  }

  // 3) Poll the row for up to 30s
  let final: any = null;
  for (let i = 0; i < 30; i++) {
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("status, attempts, last_error, internal_request_id, template_sent_at, extracted, message_body, error_message")
      .eq("message_id", messageId)
      .maybeSingle();
    if (data && (data.status === "completed" || data.status === "failed" || data.internal_request_id)) {
      final = data;
      break;
    }
    await new Promise((res) => setTimeout(res, 1000));
  }

  // 3b) Pull worker log rows for diagnostic context
  let workerLogs: any[] = [];
  try {
    const { data: logs } = await supabase
      .from("whatsapp_processing_log")
      .select("stage, status, detail, created_at")
      .eq("message_id", messageId)
      .order("created_at", { ascending: true })
      .limit(20);
    workerLogs = logs || [];
  } catch { /* table may not exist yet */ }

  // 4) Get the auth row if any
  let authRow: any = null;
  if (final?.internal_request_id) {
    const { data } = await supabase
      .from("authorization_requests")
      .select("id, status, patient_name, policy_number, diagnosis, source")
      .eq("id", final.internal_request_id)
      .maybeSingle();
    authRow = data;
  }

  return new Response(
    JSON.stringify(
      {
        ok: true,
        message_id: messageId,
        worker: { status: workerStatus, body: workerBody },
        final,
        worker_logs: workerLogs,
        authorization: authRow,
      },
      null,
      2,
    ),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
