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

export function getAssuranceLevel(authHeader: string, userId: string): string | null {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const encodedClaims = token.split(".")[1];
  if (!encodedClaims) return null;

  try {
    const base64 = encodedClaims.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    if (claims.sub !== userId) return null;
    return typeof claims.aal === "string" ? claims.aal : null;
  } catch {
    return null;
  }
}

export async function assertMfaForSensitiveAction(
  userId: string,
  assuranceLevel: string | null,
) {
  const service = getServiceClient();
  const { data: policy, error: policyError } = await service
    .from("global_policies")
    .select("value")
    .eq("key", "enforce_mfa")
    .maybeSingle();
  if (policyError) throw policyError;

  const value = policy?.value;
  const enforced =
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "enforced" in value &&
    value.enforced === true;
  if (!enforced) return;

  const { data: userRoles, error: roleError } = await service
    .from("user_roles")
    .select("mfa_exempt")
    .eq("user_id", userId);
  if (roleError) throw roleError;
  if (userRoles?.length && userRoles.every((role) => role.mfa_exempt === true)) return;

  if (assuranceLevel !== "aal2") {
    throw new Error("MFA verification is required to perform this action");
  }
}

export function assertRequestHospitalScope(
  profile: { role: string; hospital_id: string | null },
  request: {
    hospital_id?: string | null;
    requesting_hospital_id?: string | null;
    referring_hospital_id?: string | null;
    referred_hospital_id?: string | null;
    claiming_hospital_id?: string | null;
  },
) {
  if (profile.role !== "hospital") return;
  const requestHospitalIds = [
    request.hospital_id,
    request.requesting_hospital_id,
    request.referring_hospital_id,
    request.referred_hospital_id,
    request.claiming_hospital_id,
  ];
  if (!profile.hospital_id || !requestHospitalIds.includes(profile.hospital_id)) {
    throw new Error("Request not found");
  }
}

export function getSensitiveActionErrorStatus(error: unknown): number {
  if (!(error instanceof Error)) return 500;
  if (error.message === "Unauthorized") return 401;
  if (
    error.message === "Role not permitted" ||
    error.message === "Account deactivated" ||
    error.message === "MFA verification is required to perform this action"
  ) return 403;
  if (error.message === "Request not found") return 404;
  if (
    error.message === "Request is not approved" ||
    error.message === "Request is not an approved referral" ||
    error.message.startsWith("Authorization already processed")
  ) return 409;
  if (
    error.message === "authorization_id is required" ||
    error.message === "Invalid OTP type" ||
    error.message === "Invalid authorization action"
  ) return 400;
  return 500;
}

export async function validateUser(req: Request, allowedRoles: string[]) {
  const authHeader = req.headers.get("x-user-authorization") || req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  const assuranceLevel = getAssuranceLevel(authHeader, user.id);

  const service = getServiceClient();

  const { data: userProfile, error: profileError } = await service
    .from("users")
    .select("role, hospital_id, is_active, name")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  if (userProfile?.role) {
    if (userProfile.is_active === false) throw new Error("Account deactivated");
    if (!allowedRoles.includes(userProfile.role)) throw new Error("Role not permitted");
    let hospitalId = userProfile.hospital_id;
    if (userProfile.role === "hospital") {
      const { data: hospitalRole, error: hospitalRoleError } = await service
        .from("user_roles")
        .select("hospital_id")
        .eq("user_id", user.id)
        .eq("role", "hospital")
        .maybeSingle();
      if (hospitalRoleError) throw hospitalRoleError;
      hospitalId = hospitalRole?.hospital_id ?? hospitalId;
    }
    return {
      user,
      assuranceLevel,
      profile: { ...userProfile, hospital_id: hospitalId },
    };
  }

  const { data: roleRow, error: roleError } = await service
    .from("user_roles")
    .select("role, access_status, hospital_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleError) throw roleError;

  if (!roleRow?.role || !allowedRoles.includes(roleRow.role)) throw new Error("Role not permitted");
  if (String(roleRow.access_status || "active").toLowerCase() !== "active") throw new Error("Account deactivated");

  const { data: hospital, error: hospitalError } = await service
    .from("hospitals")
    .select("id, name, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (hospitalError) throw hospitalError;

  if (roleRow.role === "hospital" && hospital?.is_active === false) {
    throw new Error("Account deactivated");
  }

  return {
    user,
    assuranceLevel,
    profile: {
      role: roleRow.role,
      hospital_id: roleRow.hospital_id ?? hospital?.id ?? null,
      name: hospital?.name ?? user.email ?? "User",
      is_active: true,
    },
  };
}

export function sanitizeString(value: unknown, maxLen = 500) {
  return String(value ?? "").trim().slice(0, maxLen).replace(/[<>]/g, "");
}
