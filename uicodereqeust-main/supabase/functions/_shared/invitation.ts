import { getBrevoSender, PRODUCTION_BREVO_SENDER } from "./brevo.ts";

export const PRODUCTION_PORTAL_URL = "https://app.ronsbergerhmo.io";
export const PRODUCTION_INVITE_REDIRECT = `${PRODUCTION_PORTAL_URL}/register`;
export const PRODUCTION_INVITE_SENDER = PRODUCTION_BREVO_SENDER.email;

export class InvitationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvitationConfigurationError";
  }
}

export function invitationRedirectUrl(configuredSiteUrl?: string | null): string {
  const configured = configuredSiteUrl?.trim();
  if (!configured) return PRODUCTION_INVITE_REDIRECT;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new InvitationConfigurationError("The invitation site URL is invalid. Configure SITE_URL for the production portal.");
  }

  if (parsed.protocol !== "https:" || parsed.origin !== PRODUCTION_PORTAL_URL) {
    throw new InvitationConfigurationError("The invitation redirect must use https://app.ronsbergerhmo.io.");
  }

  return PRODUCTION_INVITE_REDIRECT;
}

export function invitationSender(): { name: string; email: string } {
  // Do not let a stale provider/shared sender override change the production
  // identity. This is the sender shown in successful application invite events.
  return getBrevoSender();
}

export function invitationLinkType(
  existing: { user_id?: string | null; onboarding_completed?: boolean | null; invite_status?: string | null } | null,
): "invite" | "magiclink" {
  if (existing?.onboarding_completed || existing?.invite_status === "completed") {
    throw new Error("A user with this email has already completed account setup.");
  }
  return existing?.user_id ? "magiclink" : "invite";
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return character;
    }
  });
}

export function brevoAccepted(status: number, payload: unknown): payload is { messageId: string } {
  if (status !== 201 || !payload || typeof payload !== "object") return false;
  const messageId = (payload as { messageId?: unknown }).messageId;
  return typeof messageId === "string" && messageId.trim().length > 0;
}
