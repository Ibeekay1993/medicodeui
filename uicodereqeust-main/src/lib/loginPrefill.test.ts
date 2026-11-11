import { describe, expect, it } from "vitest";
import { getPrefilledLoginEmail } from "@/lib/loginPrefill";

describe("getPrefilledLoginEmail", () => {
  it("prefills only the email value and decodes URL encoding", () => {
    expect(getPrefilledLoginEmail("?email=user%2Bteam%40example.com")).toBe("user+team@example.com");
    expect(getPrefilledLoginEmail("?email=user%40example.com&password=must-not-prefill")).toBe("user@example.com");
  });

  it("returns an empty value when no email is present or it is too long", () => {
    expect(getPrefilledLoginEmail("?mode=reset")).toBe("");
    expect(getPrefilledLoginEmail(`?email=${"a".repeat(255)}`)).toBe("");
  });
});
