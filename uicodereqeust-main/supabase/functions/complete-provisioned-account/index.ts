import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, maskEmail } from "../_shared/auth.ts";

const headers = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: true, message: "Method not allowed." });

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(401, { error: true, message: "Sign in with the account details sent to your email." });

  const service = getServiceClient();
  const { data: authData, error: authError } = await service.auth.getUser(token);
  if (authError || !authData?.user) return reply(401, { error: true, message: "Your session is invalid. Sign in again." });

  try {
    const payload: unknown = await req.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return reply(400, { error: true, message: "Account setup details are invalid." });
    }
    const body = payload as Record<string, unknown>;
    const fullName = String(body.fullName || "").trim();
    const hospitalName = String(body.hospitalName || "").trim();
    if (!fullName || fullName.length > 200) return reply(400, { error: true, message: "Enter your full name (200 characters or fewer)." });
    if (hospitalName.length > 200) return reply(400, { error: true, message: "Hospital name must be 200 characters or fewer." });
    if (body.acceptedTerms !== true || body.acceptedPrivacy !== true) {
      return reply(400, { error: true, message: "Accept the Terms of Service and Privacy Policy to continue." });
    }

    const { data: role, error: roleError } = await service
      .from("user_roles")
      .select("role,email,invite_status,onboarding_completed,account_setup_required,hospital_id")
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (roleError) {
      console.error("Provisioned-account setup lookup failed", { code: roleError.code });
      return reply(503, { error: true, message: "Account setup is temporarily unavailable. Please retry." });
    }
    if (!role || role.account_setup_required !== true || role.invite_status !== "pending" || role.onboarding_completed) {
      return reply(409, { error: true, message: "This account is not awaiting first-time setup." });
    }
    if (String(role.email || "").toLowerCase() !== String(authData.user.email || "").toLowerCase()) {
      return reply(403, { error: true, message: "The signed-in account does not match its assigned email." });
    }
    if (role.role === "hospital" && !role.hospital_id && !hospitalName) {
      return reply(400, { error: true, message: "Enter your hospital name to complete account setup." });
    }

    const { data: completion, error: completionError } = await service.rpc("complete_admin_provisioned_account", {
      p_user_id: authData.user.id,
      p_full_name: fullName,
      p_hospital_name: hospitalName || null,
    });
    if (completionError) {
      console.error("Provisioned-account setup completion failed", { code: completionError.code });
      return reply(400, { error: true, message: "Account setup could not be completed. Please verify the details and retry." });
    }
    const completed = Array.isArray(completion) ? completion[0] : null;
    if (!completed?.role) return reply(400, { error: true, message: "Account setup could not be completed. Please retry." });

    try {
      await service.from("audit_logs").insert({
        action: "ADMIN_PROVISIONED_ACCOUNT_SETUP_COMPLETED",
        action_type: "ADMIN_PROVISIONED_ACCOUNT_SETUP_COMPLETED",
        user_id: authData.user.id,
        actor_user_id: authData.user.id,
        actor_name: "Account holder",
        actor_role: completed.role,
        entity_type: "admin_user_management",
        entity_id: authData.user.id,
        new_values: { email: maskEmail(authData.user.email), role: completed.role, consent_completed: true },
        details: { email: maskEmail(authData.user.email), role: completed.role, consent_completed: true },
        severity: "info",
      });
    } catch {
      // Consent is recorded transactionally in the RPC; optional audit summary cannot block access.
    }

    return reply(200, { success: true, role: completed.role, hospital_id: completed.hospital_id || null });
  } catch (error) {
    console.error("Provisioned-account setup request failed", { message: error instanceof Error ? error.message : "unknown" });
    return reply(400, { error: true, message: "Account setup could not be completed. Please retry." });
  }
});
