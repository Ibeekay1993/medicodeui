import { describe, expect, it } from "vitest";
import { accessStatus, userListStatus, userListStatusLabel } from "./user-helpers";

describe("user invitation status", () => {
  it("shows an unfinished pending invite as pending in the admin list", () => {
    const user = {
      access_status: "suspended",
      invite_status: "pending",
      onboarding_completed: false,
    };

    expect(userListStatus(user)).toBe("onboarding");
    expect(userListStatusLabel(userListStatus(user))).toBe("Invitation Pending");
  });

  it("keeps pending invites blocked by the access status used for login", () => {
    const pendingInvite = {
      access_status: "suspended",
      invite_status: "pending",
      onboarding_completed: false,
    };

    expect(accessStatus(pendingInvite)).toBe("revoked");
  });

  it("keeps completed accounts governed by their actual access status", () => {
    expect(userListStatus({
      access_status: "active",
      invite_status: "completed",
      onboarding_completed: true,
    })).toBe("active");
    expect(userListStatus({
      access_status: "suspended",
      invite_status: "completed",
      onboarding_completed: true,
    })).toBe("revoked");
  });

  it("offers a resend path for expired invitations without treating them as active", () => {
    const expiredInvite = {
      access_status: "suspended",
      invite_status: "expired",
      onboarding_completed: false,
    };

    expect(userListStatus(expiredInvite)).toBe("expired");
    expect(userListStatusLabel("expired")).toBe("Invitation Expired");
  });

  it("preserves an explicitly revoked invitation state", () => {
    expect(userListStatus({
      access_status: "suspended",
      invite_status: "revoked",
      onboarding_completed: false,
    })).toBe("revoked");
  });
});
