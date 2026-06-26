// @ts-nocheck

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser, parseBrevoSender } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let payload: any = {};
  let adminUser: any = null;
  const safeAudit = async (supabase: ReturnType<typeof getServiceClient>, action: string, details: Record<string, unknown>, severity = "info") => {
    await supabase.from("audit_logs").insert({
      action,
      action_type: action,
      user_id: adminUser?.id ?? null,
      actor_user_id: adminUser?.id ?? null,
      actor_name: adminUser?.email ?? "Unknown admin",
      actor_role: "admin",
      entity_type: "admin_user_management",
      entity_id: String(details.email || "invite-user"),
      new_values: details,
      details,
      severity,
      device_info: req.headers.get("user-agent"),
      ip_address: null,
    });
  };

  try {
    // Only admins can invite users
    const validated = await validateUser(req, ["admin"]);
    adminUser = validated.user;

    payload = await req.json();
    const { email, fullName, role, phone = null, hospital_id = null } = payload;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const allowedRoles = ["admin", "hospital", "utilization_manager", "claims", "finance"];

    if (!normalizedEmail || !fullName || !role) {
      throw new Error("Missing required fields: email, fullName, role");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error("Enter a valid email address.");
    }
    if (!allowedRoles.includes(role)) {
      throw new Error("Invalid role selected.");
    }

    const supabase = getServiceClient();
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("id, user_id, last_sign_in")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (existingRole) {
      if (existingRole.last_sign_in) {
        throw new Error("A user with this email already exists and is already active.");
      } else {
        console.log(`Resending invite: Deleting old auth user ${existingRole.user_id} for ${normalizedEmail}...`);
        if (existingRole.user_id) {
          await supabase.auth.admin.deleteUser(existingRole.user_id).catch((err) => {
            console.warn("Resending invite: deleteUser failed or user did not exist in auth:", err);
          });
        }
      }
    }

    try {
      const { data: existingAuthUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) throw listError;
      if ((existingAuthUsers?.users || []).some((u: any) => String(u.email || "").toLowerCase() === normalizedEmail)) {
        throw new Error("A user with this email already exists.");
      }
    } catch (duplicateCheckError) {
      if (duplicateCheckError instanceof Error && duplicateCheckError.message.includes("already exists")) throw duplicateCheckError;
      await safeAudit(supabase, "ADMIN_INVITE_DUPLICATE_CHECK_WARNING", {
        function_name: "invite-user",
        email: normalizedEmail,
        error_message: duplicateCheckError instanceof Error ? duplicateCheckError.message : "Auth duplicate check unavailable",
        timestamp: new Date().toISOString(),
      }, "warning");
    }

    // 1. Resolve hospital name if hospital_id is present
    let hospitalName = "";
    if (hospital_id) {
      const { data: hospitalData } = await supabase
        .from("hospitals")
        .select("name")
        .eq("id", hospital_id)
        .maybeSingle();
      if (hospitalData?.name) {
        hospitalName = hospitalData.name;
      }
    }

    // 2. Generate the invite link via Supabase Admin API
    const redirectTo = `${Deno.env.get("SITE_URL") || "https://medicodeui.web.app"}/register`;
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "invite",
      email: normalizedEmail,
      options: {
        data: { full_name: fullName, role: role, hospital_id: hospital_id },
        redirectTo,
      }
    });

    if (linkError) throw linkError;
    if (!linkData?.properties?.action_link || !linkData?.user) {
      throw new Error("Failed to generate invitation link.");
    }

    const actionLink = linkData.properties.action_link;
    const inviteData = { user: linkData.user };

    // 3. Send the styled invitation email via Brevo
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const brevoFromRaw = Deno.env.get("BREVO_FROM_EMAIL") || "Ronsberger HMO <noreply@ronsbergerhmo.com>";

    if (!brevoApiKey) {
      throw new Error("SMTP service (Brevo) is not configured on the server.");
    }

    const roleDisplayNames: Record<string, string> = {
      admin: "Administrator",
      hospital: "Hospital Representative",
      nurse: "Utilization Manager",
      utilization_manager: "Utilization Manager",
      claims: "Claims Officer",
      finance: "Finance Officer",
    };
    const displayRole = roleDisplayNames[role] || role;

    const brevoSender = parseBrevoSender(brevoFromRaw);
    console.log(`📧 Sending invitation email to ${normalizedEmail} from ${brevoSender.name} <${brevoSender.email}>`);

    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: brevoSender,
        to: [{ email: normalizedEmail }],
        subject: `Ronsberger HMO - You have been invited`,
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
              <img src="https://medicodeui.web.app/ronsberger-logo.png" alt="Ronsberger HMO Logo" width="52" height="52" style="display:inline-block;border-radius:10px;background:rgba(255,255,255,0.15);padding:6px;object-fit:contain;" />
            </div>
            <div style="margin-bottom:12px;">
              <span style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Ronsberger </span><span style="color:#93c34b;font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">HMO</span>
            </div>
            <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">You have been invited</h1>
            <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:12px;font-weight:500;letter-spacing:1px;text-transform:uppercase;">Administrative Portal Access</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">Hello, <strong>${fullName}</strong></p>
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
              You have been invited as a <strong>${displayRole}</strong> to the Ronsberger HMO Administrative System.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;font-weight:700;color:#0F6E56;text-transform:uppercase;letter-spacing:1px;">Invitation Details</p>
                </td>
              </tr>
              <tr><td style="padding:12px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="padding:4px 0;font-size:12px;color:#64748B;width:40%;">Full Name</td><td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${fullName}</td></tr>
                  <tr><td style="padding:4px 0;font-size:12px;color:#64748B;">Role</td><td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${displayRole}</td></tr>
                  ${hospitalName ? `<tr><td style="padding:4px 0;font-size:12px;color:#64748B;">Hospital</td><td style="padding:4px 0;font-size:12px;color:#1E293B;font-weight:700;">${hospitalName}</td></tr>` : ""}
                </table>
              </td></tr>
            </table>

            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
              Click the button below to set up your account, choose your password, and get started:
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td align="center">
                  <a href="${actionLink}" target="_blank" style="display:inline-block;background-color:#0F6E56;color:#ffffff;padding:14px 28px;font-weight:bold;font-size:15px;text-decoration:none;border-radius:8px;box-shadow:0 4px 12px rgba(15, 110, 86, 0.2);">Activate Portal Access</a>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
              <tr>
                <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;">
                  <p style="color:#b45309;font-size:12px;font-weight:600;margin:0;">This invitation link is personal and will expire in 24 hours. Please do not forward this email.</p>
                </td>
              </tr>
            </table>

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
</html>`
      })
    });

    const brevoData = await brevoResponse.json();
    if (!brevoResponse.ok) {
      throw new Error(brevoData.message || brevoData.error || `HTTP ${brevoResponse.status}`);
    }

    // 4. Set the role in user_roles
    const { error: roleError } = await supabase.from("user_roles").upsert([{
      user_id: inviteData.user.id,
      role: role,
      full_name: fullName,
      email: normalizedEmail,
      phone,
      hospital_id,
      access_status: "active",
    }], { onConflict: "user_id" });

    if (roleError) throw roleError;

    await safeAudit(supabase, "ADMIN_USER_INVITED", {
      function_name: "invite-user",
      email: normalizedEmail,
      full_name: fullName,
      role,
      phone,
      hospital_id,
      invited_user_id: inviteData.user.id,
      timestamp: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Invitation sent to ${normalizedEmail}`,
      user: inviteData.user 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    try {
      const supabase = getServiceClient();
      await safeAudit(supabase, "ADMIN_USERS_EDGE_FUNCTION_ERROR", {
        function_name: "invite-user",
        input_payload: { email: payload?.email, fullName: payload?.fullName, role: payload?.role },
        user_performing_action: adminUser?.id ?? null,
        error_message: err instanceof Error ? err.message : "Invitation failed",
        timestamp: new Date().toISOString(),
      }, "critical");
    } catch (_) {
      // Ignore audit write failures so the original error is returned.
    }
    return new Response(JSON.stringify({ error: true, message: err instanceof Error ? err.message : "Invitation failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
