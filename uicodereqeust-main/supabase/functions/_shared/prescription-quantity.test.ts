import { describe, expect, it } from "vitest";
import {
  calculateMedicationQuantity,
  extractDurationDays,
  extractExplicitQuantity,
  extractFrequency,
  extractUnitQuantity,
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

  // ── Bug fix: BD x1/12 should give 60 tabs, not 30 ─────────────────────────
  it("BD x1/12 gives 60 tablets (twice daily for 1 month)", () => {
    const text = "Tab metformin 1g BD x1/12";
    expect(extractFrequency(text).multiplier).toBe(2);
    expect(extractDurationDays(text).days).toBe(30);
    expect(calculateMedicationQuantity(text, extractFrequency(text).multiplier)).toBe(60);
  });

  it("BD x1/12 is still 60 tabs even when (30 TABS EACH) annotation is present", () => {
    const text = "Tab metformin 1g BD x1/12 (30 TABS EACH)";
    expect(extractFrequency(text).multiplier).toBe(2);
    expect(extractDurationDays(text).days).toBe(30);
    expect(calculateMedicationQuantity(text, extractFrequency(text).multiplier)).toBe(60);
  });

  it("TDS x1/12 gives 90 tablets (three times daily for 1 month)", () => {
    const text = "Tab paracetamol 500mg TDS x1/12";
    expect(extractFrequency(text).multiplier).toBe(3);
    expect(calculateMedicationQuantity(text, extractFrequency(text).multiplier)).toBe(90);
  });

  it("dly x1/12 gives 30 tablets (once daily for 1 month)", () => {
    const text = "Lisinopril 10mg dly x1/12";
    expect(extractFrequency(text).multiplier).toBe(1);
    expect(calculateMedicationQuantity(text, extractFrequency(text).multiplier)).toBe(30);
  });

  // ── Bug fix: Insulin pen / unit-based prescriptions ─────────────────────────
  it("'Lantus insulin 1 pen' returns quantity 1, not 30", () => {
    const text = "Lantus insulin 1 pen";
    expect(extractUnitQuantity(text)).toBe(1);
    expect(calculateMedicationQuantity(text, extractFrequency(text).multiplier)).toBe(1);
  });

  it("'Insulin 2 pens' returns quantity 2", () => {
    const text = "Insulin glargine 2 pens";
    expect(extractUnitQuantity(text)).toBe(2);
    expect(calculateMedicationQuantity(text, extractFrequency(text).multiplier)).toBe(2);
  });

  it("'1 vial' returns quantity 1 via unit extraction", () => {
    expect(extractUnitQuantity("Iron sucrose 1 vial")).toBe(1);
  });

  it("'1 inhaler' returns quantity 1 via unit extraction", () => {
    expect(extractUnitQuantity("Salbutamol inhaler 1 inhaler")).toBe(1);
  });

  it("normal tablet prescription does not trigger unit extraction", () => {
    expect(extractUnitQuantity("Tab metformin 500mg dly x1/12")).toBeNull();
  });

  it("strips (30 TABS EACH) annotation before duration parsing", () => {
    expect(extractDurationDays("Amlodipine 10mg dly x1/12 (30 TABS EACH)").days).toBe(30);
  });

  it("handles backslash fraction like x 1\\12", () => {
    const text = "Amlodipine 10mg dly x 1\\12";
    expect(extractDurationDays(text).days).toBe(30);
    expect(calculateMedicationQuantity(text, extractFrequency(text).multiplier)).toBe(30);
  });

  it("handles week fraction like 2/52 (14 days)", () => {
    const text = "tab diclofenac 75mg bdX2/52 (14 tabs )";
    expect(extractFrequency(text).multiplier).toBe(2);
    expect(extractDurationDays(text).days).toBe(14);
    expect(calculateMedicationQuantity(text, extractFrequency(text).multiplier)).toBe(28);
  });

  it("strips (30 TABS) and (30 EACH) annotations cleanly", () => {
    expect(extractDurationDays("Tab Amlodipine 10mg x1/12 (30 TABS )").days).toBe(30);
    expect(extractDurationDays("Tab Amiloride T dly x1/12 (30 EACH )").days).toBe(30);
  });
});
