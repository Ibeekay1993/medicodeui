import { describe, expect, it } from "vitest";
import { normalizeEnrolleeSearchTerm } from "./enrolleeSearch";

describe("normalizeEnrolleeSearchTerm", () => {
  it("keeps names, accents, apostrophes, and beneficiary-number separators", () => {
    expect(normalizeEnrolleeSearchTerm("  O'Connor—José  1637486-1 "))
      .toBe("O'Connor José 1637486-1");
  });

  it("removes filter grammar and wildcard characters from user input", () => {
    expect(normalizeEnrolleeSearchTerm("x%,full_name.ilike.*"))
      .toBe("x full name ilike");
  });

  it("limits unusually long searches", () => {
    expect(normalizeEnrolleeSearchTerm("x".repeat(150))).toHaveLength(100);
  });
});
