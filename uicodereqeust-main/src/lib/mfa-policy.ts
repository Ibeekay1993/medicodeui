import { supabase } from "@/integrations/supabase/client";

export function shouldRequireMfa(enforced: boolean, mfaExempt: boolean | null | undefined) {
  return enforced && mfaExempt !== true;
}

export async function isMfaRequiredForUser(userId: string): Promise<boolean> {
  const policyResult = await supabase
    .from("global_policies")
    .select("value")
    .eq("key", "enforce_mfa")
    .maybeSingle();
  if (policyResult.error) throw policyResult.error;

  const value = policyResult.data?.value;
  const enforced =
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "enforced" in value &&
    value.enforced === true;

  if (!enforced) return false;

  const userResult = await supabase
    .from("user_roles")
    .select("mfa_exempt")
    .eq("user_id", userId)
    .maybeSingle();
  if (userResult.error) throw userResult.error;

  return shouldRequireMfa(true, userResult.data?.mfa_exempt);
}
