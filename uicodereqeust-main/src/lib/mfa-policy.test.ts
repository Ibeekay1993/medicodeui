import { describe, expect, it } from "vitest";
import { shouldRequireMfa } from "./mfa-policy";

describe("shouldRequireMfa", () => {
  it("disables MFA for everyone when global enforcement is off", () => {
    expect(shouldRequireMfa(false, null)).toBe(false);
    expect(shouldRequireMfa(false, false)).toBe(false);
    expect(shouldRequireMfa(false, true)).toBe(false);
  });

  it("requires MFA for users following an enabled global policy", () => {
    expect(shouldRequireMfa(true, null)).toBe(true);
    expect(shouldRequireMfa(true, false)).toBe(true);
  });

  it("allows an individual exemption while global enforcement is on", () => {
    expect(shouldRequireMfa(true, true)).toBe(false);
  });
});
