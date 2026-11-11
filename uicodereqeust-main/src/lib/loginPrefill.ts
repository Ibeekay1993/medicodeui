export function getPrefilledLoginEmail(search: string): string {
  const email = new URLSearchParams(search).get("email")?.trim() || "";
  return email.length <= 254 ? email : "";
}
