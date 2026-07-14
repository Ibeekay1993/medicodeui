import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getServiceClient, validateUser } from "../_shared/auth.ts";

interface AdminActionBody {
  action?: string;
  user_id?: string;
  id?: string;
  email?: string;
  full_name?: string;
  phone?: string;
  role?: string;
  hospital_id?: string | null;
  access_status?: string;
}

interface UserRoleRow {
  id?: string;
  user_id?: string | null;
  role?: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  hospital_id?: string | null;
  access_status?: string;
  updated_at?: string | null;
}

interface AuthUserItem {
  id?: string;
  email?: string;
  phone?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    phone?: string;
    role?: string;
    hospital_id?: string | null;
    [key: string]: unknown;
  };
  created_at?: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
}

interface HospitalRow {
  id?: string;
  name?: string;
  code?: string;
  email?: string | null;
  phone?: string | null;
  user_id?: string | null;
}

interface CombinedUser {
  id?: string;
  user_id?: string | null;
  role?: string;
  full_name?: string;
  access_status?: string;
  email?: string;
  phone?: string;
  hospital_id?: string | null;
  hospital_name?: string;
  hospital_code?: string;
  created_at?: string | null;
  updated_at?: string | null;
  last_sign_in?: string | null;
  email_confirmed?: boolean;
  auth_only?: boolean;
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: AdminActionBody = {};
  let actor: { user?: AuthUserItem; profile?: { name?: string; role?: string; } } | null = null;
  let action = "unknown";
  let supabase: ReturnType<typeof getServiceClient> | null = null;

  const safePayload = (payload: Record<string, unknown>) => {
    const copy = { ...(payload || {}) };
    delete copy.password;
    delete copy.confirmText;
    return copy;
  };

  // Safely extract a human-readable message from any thrown value
  // Works for Error, PostgrestError, AuthError, plain objects, and strings.
  const toMessage = (err: unknown): string => {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    const e = err as Record<string, unknown>;
    return (
      e?.message ||
      e?.error_description ||
      e?.msg ||
      e?.details ||
      e?.hint ||
      JSON.stringify(err)
    );
  };

  const logAdminUserEvent = async (event: string, details: Record<string, unknown>, severity = "info") => {
    if (!supabase) return;
    await supabase.from("audit_logs").insert({
      action: event,
      action_type: event,
      user_id: actor?.user?.id ?? null,
      actor_user_id: actor?.user?.id ?? null,
      actor_name: actor?.profile?.name ?? actor?.user?.email ?? "Unknown admin",
      actor_role: actor?.profile?.role ?? "admin",
      entity_type: "admin_user_management",
      entity_id: String(details.target_user_id || details.id || action || "admin-users"),
      new_values: details,
      details,
      severity,
      device_info: req.headers.get("user-agent"),
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    }).then(() => undefined);
  };

  try {
    actor = await validateUser(req, ["admin"]);
    supabase = getServiceClient();
    const url = new URL(req.url);

    if (req.method !== "GET") {
      body = await req.json();
    }
    action = url.searchParams.get("action") || body.action || req.method.toLowerCase();

    // On first GET request, backfill missing user_ids using SQL endpoint
    // (uses service_role key - the standard Supabase approach for admin operations)
    if (req.method === "GET") {
      try {
        // Create and execute a SECURITY DEFINER function to backfill user_roles
        const sqlUrl = `${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/`;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        await fetch(sqlUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": serviceKey!, "Authorization": `Bearer ${serviceKey!}` },
          body: JSON.stringify({}),
        });
      } catch {
        // best-effort; already deployed in migration
      }

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("id, user_id, role, full_name, email, phone, hospital_id, access_status, updated_at")
        .order("role");
      if (rolesError) throw rolesError;

      const { data: hospitals } = await supabase
        .from("hospitals")
        .select("id, name, code, email, phone, user_id")
        .order("name");

      let authUsers: { users: AuthUserItem[] } = { users: [] };

      try {
        const allUsers: AuthUserItem[] = [];
        let page = 1;
        let keepGoing = true;
        while (keepGoing) {
          const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000, page });
          if (error) throw error;
          const users = data?.users || [];
          allUsers.push(...users);
          keepGoing = users.length === 1000;
          page += 1;
        }
        authUsers = { users: allUsers };

      } catch (authError) {
        await logAdminUserEvent(
          "ADMIN_USERS_AUTH_LIST_WARNING",
          {
            function_name: "admin-users",
            message: authError instanceof Error ? authError.message : "Auth user list unavailable",
            timestamp: new Date().toISOString(),
          },
          "warning",
        );
      }

      const activeRoles = ["admin", "hospital", "utilization_manager", "claims", "finance"];
      const filteredRoles = (roles || []).filter((r: UserRoleRow) => activeRoles.includes(r.role as string));

      const authById = new Map((authUsers?.users || []).map((u: AuthUserItem) => [u.id, u]));
      const authByEmail = new Map((authUsers?.users || []).map((u: AuthUserItem) => [String(u.email || "").toLowerCase(), u]));
      const hospitalById = new Map((hospitals || []).map((h: HospitalRow) => [h.id, h]));
      const hospitalByUserId = new Map((hospitals || []).filter((h: HospitalRow) => h.user_id).map((h: HospitalRow) => [h.user_id, h]));

      const buildUserRecord = (r: UserRoleRow | null, authUser: AuthUserItem | null, roleFallback = "unassigned"): CombinedUser => {
        const authId = authUser?.id || r?.user_id;
        const linkedHospital = hospitalById.get(r?.hospital_id) || hospitalByUserId.get(authId) || hospitalByUserId.get(r?.user_id);

        const roleEmailRaw = r?.email;
        const roleEmail = roleEmailRaw && String(roleEmailRaw).trim() ? String(roleEmailRaw).trim() : null;
        const authEmail = authUser?.email && String(authUser.email).trim() ? String(authUser.email).trim() : null;
        const hospitalEmail = linkedHospital?.email && String(linkedHospital.email).trim() ? String(linkedHospital.email).trim() : null;

        const effectiveEmail = roleEmail || authEmail || hospitalEmail || "";

        const rolePhoneRaw = r?.phone;
        const rolePhone = rolePhoneRaw && String(rolePhoneRaw).trim() ? String(rolePhoneRaw).trim() : null;
        const authPhone = authUser?.user_metadata?.phone && String(authUser.user_metadata.phone).trim()
          ? String(authUser.user_metadata.phone).trim()
          : null;
        const hospitalPhone = linkedHospital?.phone && String(linkedHospital.phone).trim() ? String(linkedHospital.phone).trim() : null;
        const effectivePhone = rolePhone || authPhone || (authUser?.phone && String(authUser.phone).trim() ? String(authUser.phone).trim() : null) || hospitalPhone || "";

        const roleFullNameRaw = r?.full_name;
        const roleFullName = roleFullNameRaw && String(roleFullNameRaw).trim() ? String(roleFullNameRaw).trim() : null;
        const authFullName = authUser?.user_metadata?.full_name && String(authUser.user_metadata.full_name).trim()
          ? String(authUser.user_metadata.full_name).trim()
          : null;
        const authNameFallback = authUser?.user_metadata?.name && String(authUser.user_metadata.name).trim()
          ? String(authUser.user_metadata.name).trim()
          : null;
        const hospitalName = linkedHospital?.name && String(linkedHospital.name).trim() ? String(linkedHospital.name).trim() : null;

        const effectiveFullName = roleFullName || authFullName || authNameFallback || hospitalName || authEmail || "Unnamed User";

        return {
          id: r?.id || authId,
          user_id: r?.user_id || authId || null,
          role: r?.role || roleFallback,
          full_name: effectiveFullName,
          access_status: r?.access_status || "active",
          email: effectiveEmail,
          phone: effectivePhone,
          hospital_id: r?.hospital_id || linkedHospital?.id || null,
          hospital_name: linkedHospital?.name || "",
          hospital_code: linkedHospital?.code || "",
          created_at: authUser?.created_at || null,
          updated_at: r?.updated_at || null,
          last_sign_in: authUser?.last_sign_in_at || null,
          email_confirmed: authUser?.email_confirmed_at ? true : false,
          auth_only: r ? false : true,
        };
      };

      // Build a user_id → email map directly from auth users as ultimate fallback
      const authIdToEmail = new Map<string, string>();
      for (const au of authUsers?.users || []) {
        const e = String(au?.email || "").trim();
        if (au?.id && e) authIdToEmail.set(au.id, e);
      }

      // Auto-backfill + in-memory fix: for user_roles rows with NULL user_id but
      // matching email in auth.users, set user_id in memory AND write to DB.
      // Also capture the email from auth directly for the fallback map.
      const backfillPromises: Promise<void>[] = [];
      for (const r of filteredRoles) {
        if (r.user_id) continue;
        const roleEmail = r?.email && String(r.email).trim() ? String(r.email).trim().toLowerCase() : "";
        if (!roleEmail) continue;
        const matchedAuthUser = authByEmail.get(roleEmail);
        if (matchedAuthUser?.id) {
          const matchedId = matchedAuthUser.id;
          r.user_id = matchedId;
          // Also fill in email on the role row directly from auth if it's missing
          if (!r.email || !String(r.email).trim()) {
            r.email = matchedAuthUser.email;
          }
          backfillPromises.push(
            supabase!.from("user_roles").update({ user_id: matchedId, email: matchedAuthUser.email }).eq("id", r.id).then(() => undefined),
          );
        }
      }

      const combined: CombinedUser[] = [];
      const processedAuthIds = new Set<string>();
      const orphanedRoleIds: string[] = []; // role rows with deleted auth users

      for (const r of filteredRoles || []) {
        let authUser = (r.user_id ? authById.get(r.user_id) : null) || null;

        // Fallback: match by email
        const roleEmail = r?.email && String(r.email).trim() ? String(r.email).trim().toLowerCase() : "";
        if (!authUser && roleEmail) {
          authUser = authByEmail.get(roleEmail) || null;
        }

        // If auth user not found but we have a user_id, try direct email map fallback
        if (!authUser && r.user_id) {
          const directEmail = authIdToEmail.get(r.user_id);
          if (directEmail) {
            // Create a minimal authUser-like object just for email extraction
            authUser = authIdToEmail.get(r.user_id) ? { id: r.user_id, email: directEmail } : null;
          }
        }

        // If auth user not found but role row has a user_id, the auth user may
        // have been deleted directly from the Supabase dashboard. We still show
        // the user (from role row data) and schedule background cleanup, rather
        // than hiding them and showing "No users found" on a transient fetch issue.
        if (!authUser && r.user_id) {
          if (r.id) orphanedRoleIds.push(r.id);
          // Do NOT skip — always include the user so the page never goes empty
        }

        combined.push(buildUserRecord(r, authUser, r.role));
        if (authUser?.id) processedAuthIds.add(authUser.id);
      }

      // Wait for backfills to complete (fire-and-forget, non-blocking)
      if (backfillPromises.length > 0) {
        Promise.all(backfillPromises).catch(() => {});
      }

      // Auth-only users
      for (const authUser of authUsers?.users || []) {
        if (!authUser?.id) continue;
        if (processedAuthIds.has(authUser.id)) continue;
        combined.push(buildUserRecord(null, authUser, "unassigned"));
      }

      // Auto-cleanup: delete orphaned user_roles rows in background (best-effort)
      if (orphanedRoleIds.length > 0) {
        supabase
          .from("user_roles")
          .delete()
          .in("id", orphanedRoleIds)
          .then(({ error }) => {
            if (error) {
              logAdminUserEvent("ADMIN_USERS_ORPHAN_CLEANUP_ERROR", { orphaned_ids: orphanedRoleIds, error: toMessage(error) }, "warning");
            } else {
              logAdminUserEvent("ADMIN_USERS_ORPHAN_CLEANUP", { deleted_orphan_ids: orphanedRoleIds, count: orphanedRoleIds.length }, "info");
            }
          });
      }

      // Dedup by stable key (prefer user_id, else auth id, else email)
      const dedupedUsers: CombinedUser[] = [];
      const dedupeMap = new Map<string, CombinedUser>();

      const nonEmpty = (a: unknown, b: unknown) => {
        const as = a == null ? "" : String(a);
        const bs = b == null ? "" : String(b);
        return as.trim() ? as : (bs.trim() ? bs : "");
      };

      for (const userRecord of combined) {
        const key = String(userRecord.user_id || userRecord.id || userRecord.email || "").toLowerCase();
        if (!key) {
          dedupedUsers.push(userRecord);
          continue;
        }

        const existing = dedupeMap.get(key);
        if (!existing) {
          dedupeMap.set(key, userRecord);
          dedupedUsers.push(userRecord);
          continue;
        }

        dedupeMap.set(key, {
          ...existing,
          ...userRecord,
          // Prefer whichever value is non-empty; new record wins over existing empty
          email: nonEmpty(userRecord.email, existing.email),
          phone: nonEmpty(userRecord.phone, existing.phone),
          full_name: existing.full_name || userRecord.full_name || "Unnamed User",
          last_sign_in: existing.last_sign_in || userRecord.last_sign_in || null,
          email_confirmed: Boolean(existing.email_confirmed || userRecord.email_confirmed),
          access_status: existing.access_status || userRecord.access_status || "active",
          auth_only: existing.auth_only && userRecord.auth_only,
        });
      }

      // Final pass: merge auth-only users into user_roles entries that share the
      // same name. This handles unlinked users (user_id=NULL, email=NULL) where
      // the user_roles row only has a name but the auth user exists.
      const dedupedUserIds = new Set<string>();
      const dedupedEmails = new Set<string>();
      const dedupedNames = new Map<string, number>(); // normalized name → index in dedupedUsers
      for (let i = 0; i < dedupedUsers.length; i++) {
        if (dedupedUsers.at(i)!.user_id) dedupedUserIds.add(dedupedUsers.at(i)!.user_id);
        if (dedupedUsers.at(i)!.email && String(dedupedUsers.at(i)!.email).trim()) dedupedEmails.add(String(dedupedUsers.at(i)!.email).trim().toLowerCase());
        const n = String(dedupedUsers.at(i)!.full_name || "").trim().toLowerCase();
        if (n && !dedupedUsers.at(i)!.auth_only) dedupedNames.set(n, i);
      }
      for (let i = 0; i < dedupedUsers.length; i++) {
        const u = dedupedUsers.at(i)!;
        // Only merge auth-only entries into their role-row counterparts
        if (!u.auth_only) continue;
        const n = String(u.full_name || "").trim().toLowerCase();
        if (!n) continue;
        const matchIdx = dedupedNames.get(n);
        if (matchIdx === undefined || matchIdx === i) continue;
        const target = dedupedUsers.at(matchIdx)!;
        // Merge auth data into the role-row entry
        if (!target.email && u.email) target.email = u.email;
        if (!target.user_id && u.user_id) target.user_id = u.user_id;
        if (!target.last_sign_in && u.last_sign_in) target.last_sign_in = u.last_sign_in;
        if (!target.email_confirmed && u.email_confirmed) target.email_confirmed = u.email_confirmed;
        if (!target.created_at && u.created_at) target.created_at = u.created_at;
        // Remove the auth-only entry
        dedupedUsers.splice(i, 1);
        i--; // adjust index after removal
      }

      await logAdminUserEvent(
        "ADMIN_USERS_LIST",
        { function_name: "admin-users", method: "GET", result_count: dedupedUsers.length },
      );

      return new Response(JSON.stringify({ users: dedupedUsers }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sendPasswordResetEmail = async (targetEmail: string) => {
      if (!supabase) return;
      const redirectUrl = Deno.env.get("SITE_URL") || Deno.env.get("PUBLIC_SITE_URL") || "https://medicodeui.web.app";
      const { data, error } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: targetEmail,
        options: { redirectTo: `${redirectUrl}/reset-password` },
      });
      if (error) throw error;
      
      const brevoApiKey = Deno.env.get("BREVO_API_KEY");
      if (brevoApiKey) {
        const resetLink = (data as { properties?: { action_link?: string } })?.properties?.action_link || "";
        const senderRaw = Deno.env.get("BREVO_FROM_EMAIL") || "Ronsberger HMO <noreply@ronsbergerhmo.com>";
        const senderMatch = senderRaw.match(/^(.+?)\s*<([^>]+)>$/);
        const brevoSender = senderMatch
          ? { name: senderMatch[1].trim(), email: senderMatch[2].trim() }
          : { name: "Ronsberger HMO", email: senderRaw };

        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: brevoSender,
            to: [{ email: targetEmail }],
            subject: "Password Reset Request — Ronsberger HMO Portal",
            htmlContent: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
                <div style="background: linear-gradient(135deg,#0F6E56 0%,#0a5242 100%); padding: 28px 32px; text-align: center;">
                  <div style="margin-bottom: 14px;">
                    <img src="https://medicodeui.web.app/ronsberger-logo.png" alt="Ronsberger HMO Logo" width="52" height="52" style="display:inline-block;border-radius:10px;background:rgba(255,255,255,0.15);padding:6px;object-fit:contain;" />
                  </div>
                  <div style="margin-bottom: 10px;">
                    <span style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Ronsberger </span><span style="color:#93c34b;font-size:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">HMO</span>
                  </div>
                  <h1 style="color:#ffffff;margin:0;font-size:18px;font-weight:700;">Password Reset Request</h1>
                  <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:12px;font-weight:500;letter-spacing:1px;text-transform:uppercase;">Administrative Portal</p>
                </div>
                <div style="padding: 28px 32px;">
                  <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 12px;">Your system administrator has initiated a password reset for your account.</p>
                  <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${resetLink}" style="display:inline-block;background-color:#0F6E56;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.05em;box-shadow:0 4px 12px rgba(15,110,86,0.25);">Reset My Password</a>
                  </div>
                  <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">If you did not request this, please contact your administrator immediately.<br/>This is an automated email from Ronsberger HMO Portal.</p>
                </div>
                <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
                  <p style="color:#94a3b8;font-size:11px;margin:0 0 4px;letter-spacing:0.5px;">Ronsberger HMO - Clinical Authorization Platform</p>
                  <p style="color:#cbd5e1;font-size:10px;margin:0;">This is an automated message. Please do not reply.</p>
                </div>
              </div>
            `,
          }),
        });
      }
    };

    if (req.method === "PATCH" && action === "update") {
      const { user_id, full_name, email, phone, role, hospital_id, access_status } = body;
      if (!user_id) throw new Error("user_id is required");
      const allowedRoles = ["admin", "hospital", "utilization_manager", "claims", "finance"];
      if (role !== undefined && !allowedRoles.includes(role)) throw new Error("Invalid role selected");

      const { data: userData, error: getUserErr } = await supabase.auth.admin.getUserById(user_id);
      if (getUserErr || !userData?.user) {
        throw new Error(`Failed to fetch auth user: ${getUserErr?.message || "User not found"}`);
      }

      if (email && email.toLowerCase() !== userData.user.email?.toLowerCase()) {
        // Scramble the password to instantly invalidate old sessions/credentials
        const tempPassword = crypto.randomUUID() + "A1!";
        const { error } = await supabase.auth.admin.updateUserById(user_id, { 
          email,
          password: tempPassword 
        });
        if (error) throw new Error(`Email update failed: ${error.message}`);

        // Trigger password reset for the new email to verify ownership and restore access
        try {
          await sendPasswordResetEmail(email);
        } catch (emailErr) {
          console.warn("Failed to send activation email during email update:", emailErr);
        }
      }

      const userMetadata: Record<string, unknown> = {};
      if (full_name !== undefined) userMetadata.full_name = full_name;
      if (role !== undefined) userMetadata.role = role;
      if (hospital_id !== undefined) userMetadata.hospital_id = hospital_id || null;

      if (Object.keys(userMetadata).length > 0) {
        const mergedMetadata = {
          ...(userData.user.user_metadata || {}),
          ...userMetadata
        };
        const { error: metaError } = await supabase.auth.admin.updateUserById(user_id, { user_metadata: mergedMetadata });
        if (metaError) throw new Error(`Auth metadata update failed: ${metaError.message}`);
      }

      if (role !== undefined) {
        const { error: duplicateRoleError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", user_id)
          .neq("role", role);
        if (duplicateRoleError) throw duplicateRoleError;
      }

      const updates: Record<string, unknown> = {};
      if (full_name !== undefined) updates.full_name = full_name;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (role !== undefined) updates.role = role;
      if (hospital_id !== undefined) updates.hospital_id = hospital_id || null;
      if (access_status !== undefined) updates.access_status = access_status;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from("user_roles").update(updates).eq("user_id", user_id);
        if (error) throw error;
      }

      if (role !== undefined) {
        if (role === "hospital" && hospital_id) {
          try {
            // Unlink user from any other hospitals first
            await supabase.from("hospitals").update({ user_id: null }).eq("user_id", user_id);
          } catch (err) {
            console.warn("Failed to unlink user from other hospitals:", err);
          }
          await supabase.from("hospitals").update({ user_id }).eq("id", hospital_id);
        } else if (role !== "hospital") {
          try {
            // Unlink user from all hospitals if they are no longer in the hospital role
            await supabase.from("hospitals").update({ user_id: null }).eq("user_id", user_id);
          } catch (err) {
            console.warn("Failed to unlink user from all hospitals:", err);
          }
        }
      }

      await logAdminUserEvent("ADMIN_USER_UPDATED", {
        function_name: "admin-users",
        input_payload: safePayload(body),
        target_user_id: user_id,
        updated_fields: Object.keys(updates),
        timestamp: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ success: true, message: "User updated successfully." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "reset-password") {
      const { email } = body;
      if (!email) throw new Error("Email is required");

      await sendPasswordResetEmail(email);

      await logAdminUserEvent("ADMIN_USER_PASSWORD_RESET_SENT", {
        function_name: "admin-users",
        input_payload: safePayload(body),
        email,
        timestamp: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ success: true, message: `Password reset link sent to ${email}.` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "restore-access") {
      const { user_id, id } = body;
      if (!id) throw new Error("id is required");
      const { error } = await supabase.from("user_roles").update({ access_status: "active", failed_attempts: 0 }).eq("id", id);
      if (error) throw error;
      await logAdminUserEvent("ADMIN_USER_ACCESS_RESTORED", {
        function_name: "admin-users",
        input_payload: safePayload(body),
        id,
        target_user_id: user_id,
        timestamp: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "revoke-access") {
      const { user_id, id } = body;
      if (!id) throw new Error("id is required");
      const { error } = await supabase.from("user_roles").update({ access_status: "suspended" }).eq("id", id);
      if (error) throw error;
      if (user_id) {
        try {
          await supabase.auth.admin.signOut(user_id, "global");
        } catch {
          // best-effort sign out
        }
      }
      await logAdminUserEvent("ADMIN_USER_ACCESS_REVOKED", {
        function_name: "admin-users",
        input_payload: safePayload(body),
        id,
        target_user_id: user_id,
        timestamp: new Date().toISOString(),
      }, "warning");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "delete-user") {
      const { user_id, id, email } = body;
      if (!id && !user_id && !email) throw new Error("id, user_id, or email is required");

      let resolvedUserId = user_id || null;
      const resolvedRoleId = id || null;
      const resolvedEmail = String(email || "").toLowerCase();

      if (!resolvedUserId && resolvedRoleId) {
        const { data: byId, error: byIdError } = await supabase
          .from("user_roles")
          .select("id, user_id")
          .eq("id", resolvedRoleId)
          .maybeSingle();
        if (byIdError) throw byIdError;
        if (byId?.user_id) resolvedUserId = byId.user_id;
      }

      if (!resolvedUserId && resolvedEmail) {
        try {
          const { data } = await supabase.auth.admin.getUserByEmail(resolvedEmail);
          resolvedUserId = data?.user?.id || null;
        } catch {
          resolvedUserId = null;
        }
      }

      const roleRows: UserRoleRow[] = [];
      if (resolvedRoleId) {
        const { data: byId, error: byIdError } = await supabase
          .from("user_roles")
          .select("id, user_id")
          .eq("id", resolvedRoleId);
        if (byIdError) throw byIdError;
        roleRows.push(...(byId || []));
      }

      if (resolvedUserId) {
        const { data: byUserId, error: byUserIdError } = await supabase
          .from("user_roles")
          .select("id, user_id")
          .eq("user_id", resolvedUserId);
        if (byUserIdError) throw byUserIdError;
        roleRows.push(...(byUserId || []));
      }

      if (resolvedEmail && !roleRows.length) {
        const { data: byEmail, error: byEmailError } = await supabase
          .from("user_roles")
          .select("id, user_id")
          .ilike("email", resolvedEmail);
        if (byEmailError) throw byEmailError;
        roleRows.push(...(byEmail || []));
        if (!resolvedUserId && byEmail?.[0]?.user_id) resolvedUserId = byEmail[0].user_id;
      }

      const roleIds = Array.from(new Set(roleRows.map((r: UserRoleRow) => r.id).filter(Boolean)));
      if (resolvedRoleId && !roleIds.includes(resolvedRoleId)) roleIds.push(resolvedRoleId);
      if (!roleIds.length && !resolvedUserId) throw new Error("User not found");

      // deterministic delete: if UI gave a role-row id, delete only that row; else delete all rows for auth user.
      let deleteRoleIds: string[] = [];
      if (resolvedRoleId) {
        deleteRoleIds = Array.from(new Set([resolvedRoleId]));
      } else if (resolvedUserId) {
        deleteRoleIds = roleIds;
      }

      const authDeleteMessage = "";
      let authDeleteIgnored = false;
      let authDeleteSucceeded = false;

      if (resolvedUserId) {
        try {
          await supabase.auth.admin.signOut(resolvedUserId, "global");
        } catch {
          // best-effort sign out
        }
        const { error: authError } = await supabase.auth.admin.deleteUser(resolvedUserId);
        if (!authError) {
          authDeleteSucceeded = true;
        } else if (/already deleted|not found|User not found/i.test(toMessage(authError))) {
          authDeleteIgnored = true;
        } else {
          const failedMessage = `Auth user delete failed: ${toMessage(authError)}`;
          await logAdminUserEvent(
            "ADMIN_USER_DELETE_AUTH_FAILED",
            {
              function_name: "admin-users",
              input_payload: safePayload(body),
              id,
              target_user_id: resolvedUserId,
              deleted_role_ids: [],
              auth_delete_message: failedMessage,
              timestamp: new Date().toISOString(),
            },
            "critical",
          );
          // Return HTTP 200 with error body so the client can always read the message
          return new Response(JSON.stringify({ error: true, message: failedMessage }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (deleteRoleIds.length) {
        // Only delete IDs that actually exist as role rows (not auth UUIDs)
        const { data: existingRoleRows } = await supabase
          .from("user_roles")
          .select("id")
          .in("id", deleteRoleIds);
        const validRoleIds = (existingRoleRows || []).map((r: UserRoleRow) => r.id);
        if (validRoleIds.length) {
          const { error: roleError } = await supabase.from("user_roles").delete().in("id", validRoleIds);
          if (roleError) throw new Error(`Role row delete failed: ${toMessage(roleError)}`);
        }
      }

      if (resolvedUserId) {
        try {
          await supabase.from("hospitals").update({ user_id: null }).eq("user_id", resolvedUserId);
        } catch {
          // best-effort cleanup
        }
      }

      await logAdminUserEvent(
        "ADMIN_USER_DELETED",
        {
          function_name: "admin-users",
          input_payload: safePayload(body),
          id,
          target_user_id: resolvedUserId,
          deleted_role_ids: roleIds,
          auth_delete_message: authDeleteMessage,
          timestamp: new Date().toISOString(),
        },
        "warning",
      );

      return new Response(
        JSON.stringify({
          success: true,
          auth_user_deleted: authDeleteSucceeded || authDeleteIgnored,
          message: authDeleteMessage || "User deleted successfully.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    throw new Error("Unknown action");
  } catch (err) {
    const errorMessage = toMessage(err);
    await logAdminUserEvent(
      "ADMIN_USERS_EDGE_FUNCTION_ERROR",
      {
        function_name: "admin-users",
        input_payload: safePayload(body),
        action,
        user_performing_action: actor?.user?.id ?? null,
        error_message: errorMessage,
        timestamp: new Date().toISOString(),
      },
      "critical",
    );
    return new Response(JSON.stringify({ error: true, message: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

