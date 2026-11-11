import { describe, expect, it } from "vitest";
import { findExactActiveTariffMatch, findExactActiveTariffNameMatch } from "@/lib/exactActiveTariffMatch";

describe("findExactActiveTariffMatch", () => {
  it("accepts only one active result with the exact tariff code", () => {
    const expected = { code: "NHIA-12-04-03", name: "Amlodipine 10mg", amount: 70, is_active: true };
    const result = findExactActiveTariffMatch("nhia-12-04-03", [
      { ...expected, code: "NHIA-12-04-030" },
      expected,
    ]);

    expect(result).toEqual(expected);
  });

  it("rejects inactive and ambiguous matches", () => {
    expect(findExactActiveTariffMatch("NHIA-12-04-03", [
      { code: "NHIA-12-04-03", amount: 70, is_active: false },
    ])).toBeNull();

    expect(findExactActiveTariffMatch("NHIA-12-04-03", [
      { code: "NHIA-12-04-03", amount: 70, is_active: true },
      { code: "nhia-12-04-03", amount: 80, is_active: true },
    ])).toBeNull();
  });

  it("recovers a unique exact active item name while preserving its category", () => {
    const expected = { code: "NHIA-12-04-03", name: "Amlodipine Tablet (Besylate) 10mg Tab.", category: "drug", amount: 70, is_active: true };
    expect(findExactActiveTariffNameMatch("Amlodipine Tablet Besylate 10mg Tab", "drug", [expected])).toEqual(expected);
    expect(findExactActiveTariffNameMatch("Amlodipine Tablet Besylate 10mg Tab", "procedure", [expected])).toBeNull();
    expect(findExactActiveTariffNameMatch("Amlodipine 5mg tablet", "drug", [expected])).toBeNull();
  });
});
