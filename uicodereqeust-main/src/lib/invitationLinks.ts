export type InvitationOtpType = "invite" | "signup" | "magiclink";

export function invitationOtpType(value?: string | null): InvitationOtpType | null {
  if (!value) return "invite";
  if (value === "invite" || value === "signup" || value === "magiclink") return value;
  return null;
}
