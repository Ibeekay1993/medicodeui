import { describe, expect, it } from "vitest";
import { getBrevoSender } from "./brevo.ts";

describe("production Brevo sender", () => {
  it("uses the verified Ronsberger From identity", () => {
    expect(getBrevoSender()).toEqual({
      name: "Ronsberger HMO",
      email: "noreply@ronsbergerhmo.io",
    });
  });
});
