import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, maskEmail } from "../_shared/auth.ts";
import { hashInvitationToken } from "../_shared/invitation-token.ts";

const headers = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

interface AcceptPayload {
  token?: unknown;
  fullName?: unknown;
  password?: unknown;
  hospitalName?: unknown;
  acceptedTerms?: unknown;
  acceptedPrivacy?: unknown;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: true, message: "Method not allowed." });

  let tokenHash = "";
  let claimed = false;
  const service = getServiceClient();
  try {
    const payload: AcceptPayload = await req.json();
    const token = String(payload.token || "");
    const fullName = String(payload.fullName || "").trim();
    const password = String(payload.password || "");
    const hospitalName = String(payload.hospitalName || "").trim();
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return reply(400, { error: true, message: "Invitation link is invalid or expired." });
    }
    if (!fullName || fullName.length > 200) return reply(400, { error: true, message: "Enter your full name (200 characters or fewer)." });
    if (password.length < 8 || password.length > 128) return reply(400, { error: true, message: "Password must be between 8 and 128 characters." });
    if (payload.acceptedTerms !== true || payload.acceptedPrivacy !== true) {
      return reply(400, { error: true, message: "Accept the Terms of Service and Privacy Policy to continue." });
    }
    if (hospitalName.length > 200) return reply(400, { error: true, message: "Hospital name must be 200 characters or fewer." });

    tokenHash = await hashInvitationToken(token);
    const { data: claims, error: claimError } = await service.rpc("claim_user_invitation_token", {
      p_token_hash: tokenHash,
    });
    if (claimError) {
      console.error("Invitation claim failed", { code: claimError.code });
      return reply(503, { error: true, message: "Invitation verification is temporarily unavailable. Please retry." });
    }
    const claim = Array.isArray(claims) ? claims[0] : null;
    if (!claim?.user_id || !claim?.intended_email) {
      return reply(410, { error: true, message: "This invitation is invalid, expired, or already being completed. Reopen the email or ask an administrator to resend it." });
    }
    claimed = true;

    const { data: role, error: roleError } = await service
      .from("user_roles")
      .select("role,full_name,email,hospital_id,invite_status,onboarding_completed")
      .eq("user_id", claim.user_id)
      .maybeSingle();
    if (roleError || !role || String(role.email || "").toLowerCase() !== String(claim.intended_email).toLowerCase()
      || role.invite_status !== "pending" || role.onboarding_completed) {
      throw new Error("This invitation is no longer active. Ask an administrator to resend it.");
    }
    if (role.role === "hospital" && !role.hospital_id && !hospitalName) {
      throw new Error("Enter your hospital name to complete account setup.");
    }

    const { data: authResult, error: authLookupError } = await service.auth.admin.getUserById(claim.user_id);
    if (authLookupError || !authResult?.user
      || String(authResult.user.email || "").toLowerCase() !== String(claim.intended_email).toLowerCase()) {
      throw new Error("The invitation account could not be verified. Contact your administrator.");
    }

    const { error: updateAuthError } = await service.auth.admin.updateUserById(claim.user_id, {
      password,
      email_confirm: true,
      user_metadata: { ...(authResult.user.user_metadata || {}), full_name: fullName },
    });
    if (updateAuthError) {
      console.error("Invitation account activation failed", { code: updateAuthError.code || "auth_error" });
      throw new Error("Supabase Auth could not activate the account. Check Auth service health and retry.");
    }

    const { data: completion, error: completionError } = await service.rpc("complete_user_invitation", {
      p_token_hash: tokenHash,
      p_full_name: fullName,
      p_hospital_name: hospitalName || null,
    });
    if (completionError) {
      console.error("Invitation completion failed", { code: completionError.code });
      throw new Error("Account details could not be finalized. Your invitation is still available; retry account setup or contact an administrator.");
    }
    const completed = Array.isArray(completion) ? completion[0] : null;
    if (!completed?.role) throw new Error("Account details could not be finalized. Please retry or contact an administrator.");
    claimed = false;

    try {
      await service.from("audit_logs").insert({
        action: "ADMIN_USER_INVITATION_ACCEPTED",
        action_type: "ADMIN_USER_INVITATION_ACCEPTED",
        user_id: claim.user_id,
        actor_user_id: claim.user_id,
        actor_name: fullName,
        actor_role: completed.role,
        entity_type: "admin_user_management",
        entity_id: claim.user_id,
        new_values: { email: maskEmail(claim.intended_email), role: completed.role, completed: true },
        details: { email: maskEmail(claim.intended_email), role: completed.role, invitation_accepted: true },
        severity: "info",
      });
    } catch {
      // Activation must not be rolled back by an audit-log outage.
    }

    return reply(200, { success: true, role: completed.role, email: claim.intended_email });
  } catch (error) {
    if (claimed && tokenHash) {
      await service.from("user_invitation_tokens")
        .update({ claimed_at: null })
        .eq("token_hash", tokenHash)
        .is("consumed_at", null)
        .is("revoked_at", null);
    }
    const message = error instanceof Error ? error.message : "Account activation failed. Please retry.";
    return reply(400, { error: true, message });
  }
});
