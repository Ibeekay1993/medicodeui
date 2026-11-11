export type InvitationOtpType = "invite" | "signup" | "magiclink";

export function invitationOtpType(value?: string | null): InvitationOtpType | null {
  if (!value) return "invite";
  if (value === "invite" || value === "signup" || value === "magiclink") return value;
  return null;
}

export function completedInvitationLoginPath(email?: string | null): string {
  const query = new URLSearchParams();
  if (email?.trim()) query.set("email", email.trim());
  const search = query.toString();
  return `/login${search ? `?${search}` : ""}`;
}
