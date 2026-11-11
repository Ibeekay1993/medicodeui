import { describe, expect, it } from "vitest";
import { completedInvitationLoginPath, invitationOtpType } from "./invitationLinks";

describe("registration invitation links", () => {
  it("accepts invite, signup, and resend magic-link OTP types", () => {
    expect(invitationOtpType("invite")).toBe("invite");
    expect(invitationOtpType("signup")).toBe("signup");
    expect(invitationOtpType("magiclink")).toBe("magiclink");
    expect(invitationOtpType(null)).toBe("invite");
  });

  it("rejects unrelated authentication link types", () => {
    expect(invitationOtpType("recovery")).toBeNull();
    expect(invitationOtpType("email_change")).toBeNull();
  });

  it("routes completed invitations to sign-in with only the account email", () => {
    expect(completedInvitationLoginPath("staff+team@example.com")).toBe(
      "/login?email=staff%2Bteam%40example.com",
    );
    expect(completedInvitationLoginPath(null)).toBe("/login");
  });
});
