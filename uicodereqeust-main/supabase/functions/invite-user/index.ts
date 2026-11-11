import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { assertMfaForSensitiveAction, corsHeaders, getServiceClient, maskEmail, validateUser } from "../_shared/auth.ts";
import {
  brevoAccepted,
  escapeHtml,
  invitationRedirectUrl,
  invitationSender,
  InvitationConfigurationError,
} from "../_shared/invitation.ts";
import { createInvitationToken, hashInvitationToken, invitationActivationUrl } from "../_shared/invitation-token.ts";

interface InvitePayload {
  email?: string;
  fullName?: string;
  role?: string;
  phone?: string | null;
  hospital_id?: string | null;
  is_team_lead?: boolean;
  setup_mode?: "secure_invitation" | "temporary_password";
  temporary_password?: string;
}

const toMessage = (err: unknown): string => {
  if (!err) return "Invitation failed";
  if (typeof err === "string") return err;
  const e = err as Record<string, unknown>;
  const msg = String(e?.message || e?.error_description || e?.msg || e?.details || e?.hint || "");
  return msg || "Invitation failed";
};

class InvitationHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "InvitationHttpError";
  }
}

async function hashEmail(email: string): Promise<string> {
  const data = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: true, message: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    });
  }

  let payload: InvitePayload = {};
  let adminUser: { id?: string; email?: string } | null = null;
  let issuedTokenHash: string | null = null;
  let issuedTokenUserId: string | null = null;
  let invitationEmailAccepted = false;
  const safeAudit = async (supabase: ReturnType<typeof getServiceClient>, action: string, details: Record<string, unknown>, severity = "info") => {
    try {
      const email = typeof details.email === "string" ? details.email.trim().toLowerCase() : "";
      const emailHash = typeof details.email_hash === "string" ? details.email_hash : (email ? await hashEmail(email) : "");
      const sanitizedDetails: Record<string, unknown> = { ...details };
      if (email) sanitizedDetails.email = maskEmail(email);
      delete sanitizedDetails.email_hash;
      delete sanitizedDetails.full_name;
      delete sanitizedDetails.phone;
      delete sanitizedDetails.action_link;
      delete sanitizedDetails.input_payload;
      for (const key of Object.keys(sanitizedDetails)) {
        if (/(password|token|secret)/i.test(key)) delete sanitizedDetails[key];
      }
      await supabase.from("audit_logs").insert({
        action,
        action_type: action,
        user_id: adminUser?.id ?? null,
        actor_user_id: adminUser?.id ?? null,
        actor_name: "Administrator",
        actor_role: "admin",
        entity_type: "admin_user_management",
        entity_id: String(details.invited_user_id || emailHash || "invite-user"),
        new_values: sanitizedDetails,
        details: sanitizedDetails,
        severity,
        device_info: req.headers.get("user-agent"),
        ip_address: null,
      });
    } catch {
      // audit write failure should never block operation
    }
  };

  try {
    // Only admins can invite users
    const validated = await validateUser(req, ["admin"]);
    adminUser = validated.user;
    await assertMfaForSensitiveAction(validated.user.id, validated.assuranceLevel);

    const parsedPayload: unknown = await req.json();
    if (!parsedPayload || typeof parsedPayload !== "object" || Array.isArray(parsedPayload)) {
      throw new InvitationHttpError("The invitation request body must be a JSON object.", 400);
    }
    payload = parsedPayload as InvitePayload;
    const { email, fullName, role, phone = null, hospital_id = null, is_team_lead = false } = payload;
    const setupMode = payload.setup_mode === "temporary_password" ? "temporary_password" : "secure_invitation";
    const temporaryPassword = typeof payload.temporary_password === "string" ? payload.temporary_password : "";
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedName = typeof fullName === "string" ? fullName.trim() : "";
    const allowedRoles = ["admin", "hospital", "utilization_manager", "utilization_manager_lead", "claims", "claims_lead", "finance"];

    if (!normalizedEmail || !normalizedName || !role) {
      throw new InvitationHttpError("Email, full name, and role are required.", 400);
    }
    if (normalizedName.length > 200) {
      throw new InvitationHttpError("Full name must be 200 characters or fewer.", 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new InvitationHttpError("Enter a valid email address.", 400);
    }
    if (!allowedRoles.includes(role)) {
      throw new InvitationHttpError("Invalid role selected.", 400);
    }
    if (typeof is_team_lead !== "boolean" || (is_team_lead && !["hospital", "claims", "finance"].includes(role))) {
      throw new InvitationHttpError("This team lead assignment is not available for the selected role.", 400);
    }
    if (phone !== null && (typeof phone !== "string" || phone.length > 40)) {
      throw new InvitationHttpError("Enter a valid phone number.", 400);
    }
    if (setupMode === "temporary_password" && (
      temporaryPassword.length < 12 || temporaryPassword.length > 128 ||
      !/[a-z]/.test(temporaryPassword) || !/[A-Z]/.test(temporaryPassword) ||
      !/[0-9]/.test(temporaryPassword) || !/[^A-Za-z0-9]/.test(temporaryPassword)
    )) {
      throw new InvitationHttpError("Use an assigned password with 12–128 characters, including uppercase, lowercase, a number, and a symbol.", 400);
    }
    if (hospital_id !== null && (typeof hospital_id !== "string" || !/^[0-9a-f-]{36}$/i.test(hospital_id))) {
      throw new InvitationHttpError("Select a valid hospital.", 400);
    }

    const supabase = getServiceClient();
    const emailHash = await hashEmail(normalizedEmail);

    // Validate sender and redirect before creating or changing any account.
    const brevoApiKey = Deno.env.get("BREVO_API_KEY")?.trim();
    if (!brevoApiKey) {
      throw new InvitationHttpError("Account email service is not configured. Ask an administrator to review its settings.", 503);
    }
    let brevoSender: { name: string; email: string };
    let redirectTo: string;
    try {
      brevoSender = invitationSender();
      redirectTo = invitationRedirectUrl(Deno.env.get("SITE_URL"));
    } catch (error) {
      if (error instanceof InvitationConfigurationError) throw new InvitationHttpError(error.message, 503);
      throw error;
    }

    // Regional & Multi-Lead Support:
    // Organizations can appoint multiple Utilization Manager Leads and Claims Leads across states and zones.

    // Rate Limiting: max 4 invites per email within 15 minutes
    const RATE_LIMIT_MAX = 4;
    const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

    const { count: recentAttempts, error: rateLimitQueryError } = await supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .in("action", ["ADMIN_USER_INVITED", "ADMIN_USER_INVITATION_ATTEMPTED"])
      .in("entity_id", [emailHash, normalizedEmail])
      .gte("created_at", windowStart);

    if (rateLimitQueryError) {
      throw new InvitationHttpError("Could not validate invitation rate limits. Please retry shortly.", 503);
    }

    if ((recentAttempts || 0) >= RATE_LIMIT_MAX) {
      await safeAudit(supabase, "ADMIN_INVITE_RATE_LIMITED", {
        function_name: "invite-user",
        email: normalizedEmail,
        email_hash: emailHash,
        attempts_in_window: recentAttempts,
      }, "warning");
      throw new InvitationHttpError("Invitation limit reached for this address. Wait 15 minutes before retrying.", 429);
    }

    await safeAudit(supabase, "ADMIN_USER_INVITATION_ATTEMPTED", {
      function_name: "invite-user",
      email: normalizedEmail,
      email_hash: emailHash,
      role,
    });

    // Check for existing role or existing auth user
    // Preserve a pending user's Auth ID; do not delete/recreate identities to resend mail.
    const { data: existingRole, error: existingRoleError } = await supabase
      .from("user_roles")
      .select("id, user_id, role, full_name, email, phone, hospital_id, is_team_lead, invite_status, onboarding_completed")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (existingRoleError) {
      throw new InvitationHttpError("Could not verify the existing account. No invitation changes were made.", 503);
    }

    if (existingRole?.onboarding_completed || existingRole?.invite_status === "completed") {
      throw new InvitationHttpError("This account has already completed setup. Use the existing account controls instead.", 409);
    }
    if (existingRole && !existingRole.user_id) {
      throw new InvitationHttpError("An unlinked user record already exists for this email. Reconcile it before inviting so no duplicate account is created.", 409);
    }
    if (existingRole?.user_id && (existingRole.invite_status !== "pending" || existingRole.onboarding_completed)) {
      throw new InvitationHttpError("This account is not awaiting invitation setup. No account status was changed; use the approved administrator account controls.", 409);
    }

    // On a resend, the saved role and organization remain authoritative. A
    // client cannot use resend to change a pending user's role assignment.
    const isResend = Boolean(existingRole?.user_id);
    if (isResend && String(existingRole.role) !== role) {
      throw new InvitationHttpError("This pending invitation has a different assigned role. Update the user record through the approved administrator workflow first.", 409);
    }
    const intendedRole = isResend ? String(existingRole.role) : role;
    const intendedName = isResend ? String(existingRole.full_name || normalizedName) : normalizedName;
    const intendedPhone = isResend ? (existingRole.phone || phone) : phone;
    const intendedHospitalId = isResend ? (existingRole.hospital_id || hospital_id) : hospital_id;
    const intendedTeamLead = isResend ? Boolean(existingRole.is_team_lead) : Boolean(is_team_lead);

    // Resolve hospital name if hospital_id is present
    let hospitalName = "";
    if (intendedHospitalId) {
      const { data: hospitalData, error: hospitalError } = await supabase
        .from("hospitals")
        .select("name")
        .eq("id", intendedHospitalId)
        .maybeSingle();
      if (hospitalError || !hospitalData) {
        throw new InvitationHttpError("The selected hospital could not be verified. No invitation was sent.", 400);
      }
      if (hospitalData?.name) {
        hospitalName = hospitalData.name;
      }
    }

    let targetUser: { id: string; email?: string | null } | null = null;
    if (existingRole?.user_id) {
      const { data: existingAuthUser, error: existingAuthError } = await supabase.auth.admin.getUserById(existingRole.user_id);
      if (existingAuthError || !existingAuthUser?.user || String(existingAuthUser.user.email || "").toLowerCase() !== normalizedEmail) {
        throw new InvitationHttpError("The pending account could not be safely verified. No account was replaced.", 409);
      }
      targetUser = existingAuthUser.user;
    } else {
      const authPassword = setupMode === "temporary_password"
        ? temporaryPassword
        : `${createInvitationToken()}Aa1!`;
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: authPassword,
        email_confirm: setupMode === "temporary_password",
        user_metadata: { full_name: normalizedName, role: intendedRole, hospital_id: intendedHospitalId },
      });
      if (createError || !created?.user?.id) {
        const alreadyExists = /already registered|already exists/i.test(createError?.message || "");
        throw new InvitationHttpError(
          alreadyExists
            ? "An account already exists for this email but is not linked to a pending invitation. Ask an administrator to reconcile the existing account; no duplicate was created."
            : "Supabase Auth could not prepare the pending account. Check Auth service health and retry.",
          alreadyExists ? 409 : 502,
        );
      }
      targetUser = created.user;
    }
    if (!targetUser?.id) throw new InvitationHttpError("Supabase Auth did not return the pending account identity.", 502);

    if (existingRole?.user_id && setupMode === "temporary_password") {
      const { error: passwordUpdateError } = await supabase.auth.admin.updateUserById(targetUser.id, {
        password: temporaryPassword,
        email_confirm: true,
      });
      if (passwordUpdateError) {
        throw new InvitationHttpError("Supabase Auth could not set the assigned password. No access was granted.", 502);
      }
    }

    // Set the role in user_roles IMMEDIATELY so the record is guaranteed
    const { error: roleError } = await supabase.from("user_roles").upsert([{
      user_id: targetUser.id,
      role: intendedRole,
      is_team_lead: intendedTeamLead,
      full_name: intendedName,
      email: normalizedEmail,
      phone: intendedPhone,
      hospital_id: intendedHospitalId,
      // Pending accounts must remain blocked even if Auth is marked confirmed
      // during a retryable activation; completion RPC restores active access.
      access_status: setupMode === "temporary_password" ? "active" : "suspended",
      invite_status: "pending",
      onboarding_completed: false,
      account_setup_required: setupMode === "temporary_password",
    }], { onConflict: "user_id" });

    if (roleError) {
      throw new InvitationHttpError("The invitation record could not be saved. No delivery was reported.", 503);
    }

    // New links use a non-consuming, random bearer token stored only as a
    // SHA-256 digest. Opening /register validates it but does not consume it.
    let invitationTokenHash: string | null = null;
    let actionLink = "https://app.ronsbergerhmo.io/login";
    if (setupMode === "secure_invitation") {
      const invitationToken = createInvitationToken();
      invitationTokenHash = await hashInvitationToken(invitationToken);
      issuedTokenHash = invitationTokenHash;
      issuedTokenUserId = targetUser.id;
      const { error: tokenInsertError } = await supabase.from("user_invitation_tokens").insert({
        user_id: targetUser.id,
        token_hash: invitationTokenHash,
        intended_email: normalizedEmail,
        issued_by: adminUser.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (tokenInsertError) {
        console.error("Invitation token storage failed", { code: tokenInsertError.code });
        throw new InvitationHttpError("The secure invitation could not be stored. No email was sent; retry after the database is available.", 503);
      }
      actionLink = invitationActivationUrl(redirectTo, invitationToken);
    }

    // Send via the verified Brevo API sender. A 2xx response without a provider
    // message ID is not treated as a successful invitation.
    const roleDisplayNames = new Map<string, string>([
          ["admin", "Administrator"],
          ["hospital", "Hospital Representative"],
          ["nurse", "Utilization Manager"],
          ["utilization_manager", "Utilization Manager"],
          ["utilization_manager_lead", "Utilization Manager Lead"],
          ["claims", "Claims Officer"],
          ["claims_lead", "Claims Lead (Head of Claims)"],
          ["finance", "Finance Officer"],
    ]);
    const displayRole = roleDisplayNames.get(intendedRole) || intendedRole;
    const safeFullName = escapeHtml(intendedName);
    const safeHospitalName = escapeHtml(hospitalName);
    const safeActionLink = escapeHtml(actionLink);
    const safeTemporaryPassword = escapeHtml(temporaryPassword);
    const isTemporaryPasswordSetup = setupMode === "temporary_password";

    let brevoResponse: Response;
    try {
      brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": brevoApiKey,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({
            sender: brevoSender,
            to: [{ email: normalizedEmail }],
            subject: isTemporaryPasswordSetup
              ? "Ronsberger HMO - Your account details"
              : "Ronsberger HMO - You have been invited",
            textContent: isTemporaryPasswordSetup
              ? `Hello, ${intendedName}. Your Ronsberger HMO portal account is ready. Sign in at https://app.ronsbergerhmo.io/login with ${normalizedEmail} and the password provided by your administrator: ${temporaryPassword}. On first sign-in, accept the Terms of Service and Privacy Policy before accessing any portal records. Changing this password is optional. If you choose to change it later, start here: https://app.ronsbergerhmo.io/login?mode=reset. Do not forward this email.`
              : `Hello, ${intendedName}. You have been invited to the Ronsberger HMO Administrative Portal as ${displayRole}. Set up your account here: ${actionLink}. This personal invitation link expires in 7 days.`,
            htmlContent: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f4f3;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f3;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0F6E56 0%,#0a5242 100%);padding:28px 32px;text-align:center;">
            <div style="margin-bottom:14px;">
              <img src="https://app.ronsbergerhmo.io/ronsberger-logo.png" alt="Ronsberger HMO Logo" width="52" height="52" style="display:inline-block;border-radius:10px;background:rgba(255,255,255,0.15);padding:6px;object-fit:contain;" />
            </div>
            <div style="margin-bottom:12px;">
              <span style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Ronsberger </span><span style="color:#93c34b;font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">HMO</span>
            </div>
            <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">${isTemporaryPasswordSetup ? "Your portal account is ready" : "You have been invited"}</h1>
            <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:12px;font-weight:500;letter-spacing:1px;text-transform:uppercase;">Administrative Portal Access</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">Hello, <strong>${safeFullName}</strong></p>
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
              ${isTemporaryPasswordSetup
                ? `Your account is ready for the Ronsberger HMO Administrative System as a <strong>${displayRole}</strong>.`
                : `You have been invited as a <strong>${displayRole}</strong> to the Ronsberger HMO Administrative System.`}
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;font-weight:700;color:#0F6E56;text-transform:uppercase;letter-spacing:1px;">Invitation Details</p>
                </td>
              </tr>
              <tr><td style="padding:12px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="padding:4px 0;font-size:12px;color:#64748B;width:40%;">Full Name</td><td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${safeFullName}</td></tr>
                  <tr><td style="padding:4px 0;font-size:12px;color:#64748B;">Role</td><td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${displayRole}</td></tr>
                  ${hospitalName ? `<tr><td style="padding:4px 0;font-size:12px;color:#64748B;">Hospital</td><td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${safeHospitalName}</td></tr>` : ""}
                </table>
              </td></tr>
            </table>
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
              ${isTemporaryPasswordSetup
                ? "Use these account details to sign in. You will need to accept the Terms of Service and Privacy Policy before you can access portal records. You may keep this password or change it later."
                : "Click the button below to set up your account, choose your password, and get started:"}
            </p>
            ${isTemporaryPasswordSetup ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #dbe4ee;border-radius:10px;overflow:hidden;">
              <tr><td style="padding:12px 16px;background:#f8fafc;font-size:12px;color:#64748b;">Sign-in email</td><td style="padding:12px 16px;color:#172033;font-weight:700;word-break:break-word;">${escapeHtml(normalizedEmail)}</td></tr>
              <tr><td style="padding:12px 16px;border-top:1px solid #dbe4ee;background:#f8fafc;font-size:12px;color:#64748b;">Password provided by your administrator</td><td style="padding:12px 16px;border-top:1px solid #dbe4ee;color:#172033;font-weight:700;word-break:break-all;">${safeTemporaryPassword}</td></tr>
            </table>` : ""}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td align="center">
                  <a href="${safeActionLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#0F6E56;color:#ffffff;padding:14px 28px;font-weight:bold;font-size:15px;text-decoration:none;border-radius:8px;box-shadow:0 4px 12px rgba(15, 110, 86, 0.2);">${isTemporaryPasswordSetup ? "Sign in to the Portal" : "Activate Portal Access"}</a>
                </td>
              </tr>
            </table>
            ${isTemporaryPasswordSetup ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
              <tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;"><p style="color:#1e3a8a;font-size:12px;font-weight:600;margin:0;">This email contains your sign-in password. Keep it private. Portal access stays restricted until you accept the required policies. Changing the password is optional.</p></td></tr>
            </table>` : `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
              <tr>
                <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;">
                  <p style="color:#b45309;font-size:12px;font-weight:600;margin:0;">This invitation link is personal and will expire in 7 days. Please do not forward this email.</p>
                </td>
              </tr>
            </table>`}
            ${isTemporaryPasswordSetup ? `
            <p style="color:#64748b;font-size:12px;line-height:1.5;margin:0 0 20px;text-align:center;">
              If you choose to change your password later, <a href="https://app.ronsbergerhmo.io/login?mode=reset" style="color:#0F6E56;font-weight:700;">request a password reset link</a> from the sign-in page.
            </p>` : ""}
            <p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:0;">If you did not expect this invitation, you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
            <p style="color:#475569;font-size:12px;margin:0 0 6px;">Warm regards,<br/><strong style="color:#0F6E56;">Ronsberger HMO Operations Team</strong></p>
            <p style="color:#94a3b8;font-size:11px;margin:6px 0 4px;letter-spacing:0.5px;">Ronsberger HMO &mdash; Clinical Authorization &amp; Claims Platform</p>
            <p style="color:#cbd5e1;font-size:10px;margin:0;">This is an automated message. Please do not reply to this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
          }),
      });
    } catch {
      throw new InvitationHttpError("Could not send the account email. The pending account is preserved; retry after the email service recovers.", 502);
    }

    const brevoData = await brevoResponse.json().catch(() => null);
    if (!brevoAccepted(brevoResponse.status, brevoData)) {
      const providerCode = brevoData && typeof brevoData === "object" && typeof (brevoData as { code?: unknown }).code === "string"
        ? (brevoData as { code: string }).code
        : undefined;
      console.error("Invitation email rejected by Brevo", { status: brevoResponse.status, providerCode });
      throw new InvitationHttpError(
        brevoResponse.status === 401 || brevoResponse.status === 403
          ? "The account email service rejected its credentials. Ask an administrator to review the email service settings."
          : "The account email was not accepted. Ask an administrator to review the sender and email service settings, then retry.",
        502,
      );
    }
    const providerMessageId = brevoData.messageId;
    invitationEmailAccepted = true;

      await safeAudit(supabase, "ADMIN_USER_INVITED", {
      function_name: "invite-user",
      email: normalizedEmail,
      email_hash: emailHash,
      role: intendedRole,
      hospital_id,
      invited_user_id: targetUser.id,
      email_sent: true,
      email_provider_message_id: providerMessageId,
      invitation_expires_at: isTemporaryPasswordSetup ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      setup_mode: setupMode,
      timestamp: new Date().toISOString(),
    });

    let revokeQuery = supabase
      .from("user_invitation_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", targetUser.id)
      .is("consumed_at", null)
      .is("revoked_at", null);
    if (invitationTokenHash) revokeQuery = revokeQuery.neq("token_hash", invitationTokenHash);
    const { error: revokeError } = await revokeQuery;
    if (revokeError) {
      // The newly sent link works; retain an audit trail if token rotation could
      // not revoke older links due to a transient database error.
      console.error("Previous invitation token revocation failed", { code: revokeError.code });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      email_sent: true,
      setup_mode: setupMode,
      message: isTemporaryPasswordSetup
        ? "The account details email was accepted for delivery. Confirm the user can access the sign-in page."
        : "The setup-link email was accepted for delivery. Confirm the user received it.",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    let status = 500;
    let errorMsg = "The invitation could not be completed. Please retry or check the server logs.";
    const rawMessage = toMessage(err);
    if (err instanceof InvitationHttpError) {
      status = err.status;
      errorMsg = err.message;
    } else if (err instanceof InvitationConfigurationError) {
      status = 503;
      errorMsg = err.message;
    } else if (rawMessage === "Unauthorized") {
      status = 401;
      errorMsg = "Your session is not authorized to invite users. Sign in again with an administrator account.";
    } else if (["Role not permitted", "Account deactivated", "MFA verification is required to perform this action"].includes(rawMessage)) {
      status = 403;
      errorMsg = rawMessage;
    }
    try {
      const supabase = getServiceClient();
      if (issuedTokenHash && issuedTokenUserId && !invitationEmailAccepted) {
        await supabase.from("user_invitation_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("token_hash", issuedTokenHash)
          .eq("user_id", issuedTokenUserId)
          .is("consumed_at", null);
      }
      await safeAudit(supabase, "ADMIN_USER_INVITATION_FAILED", {
        function_name: "invite-user",
        email: typeof payload?.email === "string" ? payload.email : "",
        role: payload?.role,
        user_performing_action: adminUser?.id ?? null,
        error_message: errorMsg,
        timestamp: new Date().toISOString(),
      }, "critical");
    } catch {
      // Ignore audit write failures
    }
    return new Response(JSON.stringify({ error: true, email_sent: false, message: errorMsg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
