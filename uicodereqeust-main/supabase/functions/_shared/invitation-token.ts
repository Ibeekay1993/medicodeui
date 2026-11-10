const TOKEN_BYTES = 32;

export function createInvitationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashInvitationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function invitationActivationUrl(registerUrl: string, token: string): string {
  const url = new URL(registerUrl);
  if (url.protocol !== "https:" || url.origin !== "https://app.ronsbergerhmo.io") {
    throw new Error("Invitation links must use the production portal HTTPS origin.");
  }
  url.search = "";
  // Put the bearer token in the fragment so web servers and referrer headers
  // do not receive it as a query string. The registration page consumes it
  // client-side and immediately removes it from the address bar.
  url.hash = new URLSearchParams({ invitation: token }).toString();
  return url.toString();
}
