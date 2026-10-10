import { describe, expect, it } from "vitest";
import {
  calculateMedicationQuantity,
  extractDurationDays,
  extractExplicitQuantity,
  extractFrequency,
} from "./prescription-quantity.ts";

describe("prescription quantity parsing", () => {
  it("calculates one tablet daily for a month when shorthand includes a 30-day supply", () => {
    const text = "1 tab dly x 1/12 x 30";
    expect(calculateMedicationQuantity(text, extractFrequency(text).multiplier)).toBe(30);
  });

  it("uses the explicit 30-day supply when no month fraction is present", () => {
    const text = "2 tabs bd x 30";
    expect(calculateMedicationQuantity(text, extractFrequency(text).multiplier)).toBe(120);
  });

  it("calculates multiple medications independently", () => {
    const prescriptions = ["1 tab dly x 1/12 x 30", "2 caps bd x 30"];
    expect(prescriptions.map((text) => calculateMedicationQuantity(text, extractFrequency(text).multiplier)))
      .toEqual([30, 120]);
  });

  it("honors month fractions greater than one even with a 30-day multiplier", () => {
    const text = "1 tab dly x 2/12 x 30";
    expect(extractDurationDays(text).days).toBe(60);
    expect(calculateMedicationQuantity(text, extractFrequency(text).multiplier)).toBe(60);
  });

  it("does not treat the numerator of a duration fraction as an explicit quantity", () => {
    expect(extractExplicitQuantity("1 tab dly x 1/12 x 30")).toBe(30);
    expect(extractDurationDays("1 tab dly x 1/12 x 30").days).toBe(30);
  });

  it("keeps a duration fraction distinct from an explicit quantity", () => {
    expect(extractExplicitQuantity("1 tab x 1/12")).toBeNull();
    expect(extractDurationDays("1 tab dly x 1/12").days).toBe(30);
  });
});
