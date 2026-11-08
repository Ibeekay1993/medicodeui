import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

export { corsHeaders };

export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const min = Math.min(a.length, b.length);
  for (let i = 0; i < min; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}


export function maskPhone(phone?: string | null): string {
  if (!phone) return "";
  const cleaned = phone.trim();
  if (cleaned.length <= 4) return "****";
  return `${cleaned.slice(0, 3)}****${cleaned.slice(-4)}`;
}

export function maskEmail(email?: string | null): string {
  if (!email) return "";
  const cleaned = email.trim();
  const [user, domain] = cleaned.split("@");
  if (!domain) return "****";
  const maskedUser = user.length > 2 ? `${user[0]}***${user[user.length - 1]}` : `${user[0] || "*"}***`;
  return `${maskedUser}@${domain}`;
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
  const authHeader = req.headers.get("Authorization") || req.headers.get("x-user-authorization");
  if (!authHeader) throw new Error("Unauthorized");

  const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!rawToken) throw new Error("Unauthorized");

  const service = getServiceClient();

  // 1. Verify token directly via service client with the explicit JWT string
  let user: any = null;
  const { data: serviceUserData, error: serviceUserError } = await service.auth.getUser(rawToken);
  if (!serviceUserError && serviceUserData?.user) {
    user = serviceUserData.user;
  } else {
    // 2. Fallback to anon client with token passed explicitly
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false } }
    );
    const { data: anonUserData, error: anonUserError } = await anonClient.auth.getUser(rawToken);
    if (!anonUserError && anonUserData?.user) {
      user = anonUserData.user;
    }
  }
  // Fail closed: Never trust unverified JWT payloads without signature verification.
  if (!user) throw new Error("Unauthorized");
  const assuranceLevel = getAssuranceLevel(rawToken, user.id);

  // 1. Direct query against canonical user_roles table
  const { data: roleRow, error: roleError } = await service
    .from("user_roles")
    .select("role, access_status, hospital_id, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!roleError && roleRow?.role) {
    if (String(roleRow.access_status || "active").toLowerCase() !== "active") {
      throw new Error("Account deactivated");
    }
    if (!allowedRoles.includes(roleRow.role)) {
      throw new Error("Role not permitted");
    }

    let hospitalId = roleRow.hospital_id;
    let hospitalName = roleRow.full_name;

    if (roleRow.role === "hospital") {
      const { data: hospital } = await service
        .from("hospitals")
        .select("id, name, is_active")
        .eq("user_id", user.id)
        .maybeSingle();
      if (hospital?.is_active === false) {
        throw new Error("Account deactivated");
      }
      hospitalId = hospitalId ?? hospital?.id ?? null;
      hospitalName = hospital?.name ?? hospitalName;
    }

    return {
      user,
      assuranceLevel,
      profile: {
        role: roleRow.role,
        hospital_id: hospitalId,
        name: hospitalName || user.email || "User",
        is_active: true,
      },
    };
  }

  // 2. Fallback to public.users view
  const { data: userProfile } = await service
    .from("users")
    .select("role, hospital_id, is_active, name")
    .eq("id", user.id)
    .maybeSingle();

  if (userProfile?.role) {
    if (userProfile.is_active === false) throw new Error("Account deactivated");
    if (!allowedRoles.includes(userProfile.role)) throw new Error("Role not permitted");
    return {
      user,
      assuranceLevel,
      profile: {
        role: userProfile.role,
        hospital_id: userProfile.hospital_id,
        name: userProfile.name || user.email || "User",
        is_active: true,
      },
    };
  }

  throw new Error("Role not permitted");
}

export function sanitizeString(value: unknown, maxLen = 500) {
  return String(value ?? "").trim().slice(0, maxLen).replace(/[<>]/g, "");
}
