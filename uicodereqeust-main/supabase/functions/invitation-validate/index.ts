import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient } from "../_shared/auth.ts";
import { hashInvitationToken } from "../_shared/invitation-token.ts";

const headers = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: true, message: "Method not allowed." });

  try {
    const payload: unknown = await req.json();
    const token = payload && typeof payload === "object" && "token" in payload
      ? String((payload as { token?: unknown }).token || "")
      : "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return reply(400, { error: true, message: "Invitation link is invalid or expired." });
    }

    const service = getServiceClient();
    const tokenHash = await hashInvitationToken(token);
    const { data: invitation, error: invitationError } = await service
      .from("user_invitation_tokens")
      .select("user_id,intended_email,issued_at,expires_at,consumed_at,revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (invitationError) {
      console.error("Invitation validation storage error", { code: invitationError.code });
      return reply(503, { error: true, message: "Invitation verification is temporarily unavailable. Please retry." });
    }
    if (!invitation || invitation.consumed_at || invitation.revoked_at || Date.parse(invitation.expires_at) <= Date.now()) {
      return reply(410, { error: true, message: "This invitation is invalid or has expired. Ask an administrator to resend it." });
    }

    const { data: role, error: roleError } = await service
      .from("user_roles")
      .select("role,full_name,email,hospital_id,invite_status,onboarding_completed")
      .eq("user_id", invitation.user_id)
      .maybeSingle();
    if (roleError) {
      console.error("Invitation role lookup failed", { code: roleError.code });
      return reply(503, { error: true, message: "Invitation verification is temporarily unavailable. Please retry." });
    }
    if (!role || String(role.email || "").toLowerCase() !== String(invitation.intended_email).toLowerCase()
      || role.invite_status !== "pending" || role.onboarding_completed) {
      return reply(410, { error: true, message: "This invitation is no longer active. Ask an administrator to resend it." });
    }

    let hospitalName: string | null = null;
    if (role.hospital_id) {
      const { data: hospital, error: hospitalError } = await service
        .from("hospitals")
        .select("name")
        .eq("id", role.hospital_id)
        .maybeSingle();
      if (hospitalError) {
        console.error("Invitation hospital lookup failed", { code: hospitalError.code });
        return reply(503, { error: true, message: "Invitation verification is temporarily unavailable. Please retry." });
      }
      hospitalName = hospital?.name ?? null;
    }

    return reply(200, {
      success: true,
      email: invitation.intended_email,
      full_name: role.full_name,
      role: role.role,
      hospital_id: role.hospital_id,
      hospital_name: hospitalName,
      expires_at: invitation.expires_at,
    });
  } catch (error) {
    console.error("Invitation validation failed", { message: error instanceof Error ? error.message : "unknown" });
    return reply(400, { error: true, message: "Invitation link is invalid or expired." });
  }
});
