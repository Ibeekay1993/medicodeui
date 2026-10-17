type WhatsAppHospitalContactDenialReason =
  | "phone_required"
  | "unregistered_sender"
  | "ambiguous_sender"
  | "identity_lookup_failed";

export type WhatsAppHospitalContactResolution =
  | { authorized: true; hospitalId: string }
  | { authorized: false; reason: WhatsAppHospitalContactDenialReason };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_DENIAL_REASONS = new Set<WhatsAppHospitalContactDenialReason>([
  "phone_required",
  "unregistered_sender",
  "ambiguous_sender",
]);

/** Parse the restricted service-role resolver response without exposing DB details. */
export function parseWhatsAppHospitalContactResolution(
  data: unknown,
  error?: unknown,
): WhatsAppHospitalContactResolution {
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return { authorized: false, reason: "identity_lookup_failed" };
  }

  const result = data as Record<string, unknown>;
  if (result.authorized !== true) {
    const reason = typeof result.reason === "string" && SAFE_DENIAL_REASONS.has(result.reason as WhatsAppHospitalContactDenialReason)
      ? result.reason as WhatsAppHospitalContactDenialReason
      : "unregistered_sender";
    return { authorized: false, reason };
  }

  const hospitalId = typeof result.hospital_id === "string" ? result.hospital_id.trim() : "";
  if (!UUID_PATTERN.test(hospitalId)) {
    return { authorized: false, reason: "identity_lookup_failed" };
  }

  return { authorized: true, hospitalId };
}
