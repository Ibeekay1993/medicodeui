import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

export { corsHeaders };

export function parseBrevoSender(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: "Ronsberger HMO", email: raw };
}

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function validateUser(req: Request, allowedRoles: string[]) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");

  const service = getServiceClient();

  const { data: userProfile } = await service
    .from("users")
    .select("role, hospital_id, is_active, name")
    .eq("id", user.id)
    .maybeSingle();

  if (userProfile?.role) {
    if (userProfile.is_active === false) throw new Error("Account deactivated");
    if (!allowedRoles.includes(userProfile.role)) throw new Error("Role not permitted");
    return { user, profile: userProfile };
  }

  const { data: roleRow } = await service
    .from("user_roles")
    .select("role, access_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!roleRow?.role || !allowedRoles.includes(roleRow.role)) throw new Error("Role not permitted");
  if (String(roleRow.access_status || "active").toLowerCase() !== "active") throw new Error("Account deactivated");

  const { data: hospital } = await service
    .from("hospitals")
    .select("id, name, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleRow.role === "hospital" && hospital?.is_active === false) {
    throw new Error("Account deactivated");
  }

  return {
    user,
    profile: {
      role: roleRow.role,
      hospital_id: hospital?.id ?? null,
      name: hospital?.name ?? user.email ?? "User",
      is_active: true,
    },
  };
}

export function sanitizeString(value: unknown, maxLen = 500) {
  return String(value ?? "").trim().slice(0, maxLen).replace(/[<>]/g, "");
}
