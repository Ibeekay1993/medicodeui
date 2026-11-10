import { describe, expect, it } from "vitest";
import { createInvitationToken, hashInvitationToken, invitationActivationUrl } from "./invitation-token";

describe("invitation bearer tokens", () => {
  it("creates high-entropy URL-safe tokens and stores only a one-way digest", async () => {
    const token = createInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const hash = await hashInvitationToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(await hashInvitationToken(token)).toBe(hash);
  });

  it("builds activation links only on the production portal", () => {
    expect(invitationActivationUrl("https://app.ronsbergerhmo.io/register", "abc"))
      .toBe("https://app.ronsbergerhmo.io/register#invitation=abc");
    expect(() => invitationActivationUrl("https://example.com/register", "abc")).toThrow(/production portal/i);
  });
});
