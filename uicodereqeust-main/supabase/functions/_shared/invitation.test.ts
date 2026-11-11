import { describe, expect, it } from "vitest";
import {
  brevoAccepted,
  escapeHtml,
  invitationLinkType,
  invitationAccountAlreadyCompleted,
  invitationRedirectUrl,
  invitationSender,
  InvitationConfigurationError,
  PRODUCTION_INVITE_REDIRECT,
  PRODUCTION_INVITE_SENDER,
} from "./invitation.ts";

describe("invitation delivery helpers", () => {
  it("uses the canonical production registration URL and rejects stale domains", () => {
    expect(invitationRedirectUrl()).toBe(PRODUCTION_INVITE_REDIRECT);
    expect(invitationRedirectUrl("https://app.ronsbergerhmo.io/login/")).toBe(PRODUCTION_INVITE_REDIRECT);
    expect(() => invitationRedirectUrl("https://medicodeui.web.app/register")).toThrow(InvitationConfigurationError);
    expect(() => invitationRedirectUrl("http://app.ronsbergerhmo.io/register")).toThrow(InvitationConfigurationError);
  });

  it("always uses the verified noreply sender", () => {
    expect(invitationSender()).toEqual({ name: "Ronsberger HMO", email: PRODUCTION_INVITE_SENDER });
    expect(invitationSender().email).toBe("noreply@ronsbergerhmo.io");
  });

  it("resends a pending existing account without deleting or replacing its Auth identity", () => {
    expect(invitationLinkType(null)).toBe("invite");
    expect(invitationLinkType({ user_id: "pending-user", invite_status: "pending" })).toBe("magiclink");
    expect(() => invitationLinkType({ user_id: "active-user", invite_status: "completed" })).toThrow(/completed account setup/i);
  });

  it("recognizes a completed invitation only for its matching account email", () => {
    expect(invitationAccountAlreadyCompleted({
      email: "staff@example.com",
      invite_status: "completed",
      onboarding_completed: true,
    }, "STAFF@example.com")).toBe(true);
    expect(invitationAccountAlreadyCompleted({
      email: "other@example.com",
      invite_status: "completed",
      onboarding_completed: true,
    }, "staff@example.com")).toBe(false);
    expect(invitationAccountAlreadyCompleted({
      email: "staff@example.com",
      invite_status: "pending",
      onboarding_completed: false,
    }, "staff@example.com")).toBe(false);
  });

  it("treats only Brevo 201 responses with a message ID as accepted", () => {
    expect(brevoAccepted(201, { messageId: "<accepted-id>" })).toBe(true);
    expect(brevoAccepted(200, { messageId: "<unexpected-status>" })).toBe(false);
    expect(brevoAccepted(201, {})).toBe(false);
    expect(brevoAccepted(400, { messageId: "<rejected>" })).toBe(false);
  });

  it("escapes user supplied text before it is inserted into the HTML email", () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");
  });
});
