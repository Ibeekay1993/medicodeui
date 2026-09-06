import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const PIN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function generateUniqueArrivalPin(
  supabase: SupabaseClient,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const pin = Array.from(bytes, (byte) => PIN_CHARS[byte % PIN_CHARS.length]).join("");
    const { data, error } = await supabase
      .from("otp_verifications")
      .select("id")
      .eq("otp_value", pin)
      .eq("verified", false)
      .maybeSingle();
    if (error) throw error;
    if (!data) return pin;
  }
  throw new Error("Failed to generate a unique arrival PIN after 10 attempts");
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function ensureArrivalPin(
  supabase: SupabaseClient,
  authorizationId: string,
  email = "no-email@medicode.com",
  createdBy: string | null = null,
): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from("otp_verifications")
    .select("otp_value")
    .eq("authorization_id", authorizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.otp_value) return existing.otp_value;

  const pin = await generateUniqueArrivalPin(supabase);
  const { error } = await supabase.from("otp_verifications").insert({
    authorization_id: authorizationId,
    otp_hash: await sha256Hex(pin),
    otp_value: pin,
    email,
    expires_at: new Date(
      Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    created_by: createdBy,
    otp_type: "ARRIVAL",
  });
  if (error) throw error;
  return pin;
}
