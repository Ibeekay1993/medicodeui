import { describe, expect, it } from "vitest";
import { constantTimeEqual, getAssuranceLevel } from "./auth.ts";

describe("auth security helpers", () => {
  describe("constantTimeEqual", () => {
    it("returns true for identical strings", () => {
      expect(constantTimeEqual("secret123", "secret123")).toBe(true);
      expect(constantTimeEqual("", "")).toBe(true);
      expect(constantTimeEqual("very-long-secret-key-1234567890", "very-long-secret-key-1234567890")).toBe(true);
    });

    it("returns false for strings of different length", () => {
      expect(constantTimeEqual("secret123", "secret12")).toBe(false);
      expect(constantTimeEqual("short", "longer-string")).toBe(false);
      expect(constantTimeEqual("", "non-empty")).toBe(false);
    });

    it("returns false for strings of same length with different characters", () => {
      expect(constantTimeEqual("secret123", "secret124")).toBe(false);
      expect(constantTimeEqual("abcdef", "fedcba")).toBe(false);
    });
  });

  describe("getAssuranceLevel", () => {
    function makeToken(payload: Record<string, unknown>): string {
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const claims = Buffer.from(JSON.stringify(payload)).toString("base64url");
      return `${header}.${claims}.fake_signature`;
    }

    it("extracts aal claim when sub matches userId", () => {
      const token = makeToken({ sub: "user-123", aal: "aal2", exp: Math.floor(Date.now() / 1000) + 3600 });
      expect(getAssuranceLevel(token, "user-123")).toBe("aal2");
    });

    it("returns null if token sub does not match expected userId", () => {
      const token = makeToken({ sub: "victim-user-456", aal: "aal2" });
      expect(getAssuranceLevel(token, "attacker-user-123")).toBeNull();
    });

    it("returns null if token has no aal claim", () => {
      const token = makeToken({ sub: "user-123" });
      expect(getAssuranceLevel(token, "user-123")).toBeNull();
    });

    it("returns null for malformed token strings", () => {
      expect(getAssuranceLevel("not.a.valid.jwt", "user-123")).toBeNull();
      expect(getAssuranceLevel("", "user-123")).toBeNull();
    });
  });
});
