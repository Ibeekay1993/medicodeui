import { describe, it, expect, vi } from "vitest";
import {
  stripFieldLabels,
  splitTerms,
  extractFrequency,
  extractDurationDays,
  normalizeStrength,
  parsePrescriptionClientFallback,
} from "./prescriptionParser";

describe("prescriptionParser", () => {
  it("safely strips field labels without corrupting subsequent words", () => {
    const raw = "Services: Tab Amlodipine 10mg dly x1/12, pregabalin T b.d 75mg x4//52";
    const stripped = stripFieldLabels(raw);
    expect(stripped.startsWith("s:")).toBe(false);
    expect(stripped).toContain("Tab Amlodipine 10mg");
  });

  it("splits multiple medications correctly even with non-standard punctuation", () => {
    const raw = "Services: Tab Amlodipine 10mg dly x1/12, pregabalin T b.d 75mg x4//52";
    const terms = splitTerms(raw);
    expect(terms.length).toBe(2);
    expect(terms[0]).toBe("Tab Amlodipine 10mg dly x1/12");
    expect(terms[1]).toBe("pregabalin T b.d 75mg x4//52");
  });

  it("preserves a leading tablet or capsule count as part of its prescription", () => {
    expect(splitTerms("Services: 1 tab Amlodipine 10mg dly x1/12")[0])
      .toBe("1 tab Amlodipine 10mg dly x1/12");
    expect(splitTerms("Services: 1 cap pregabalin T b.d 75mg x4//52")[0])
      .toBe("1 cap pregabalin T b.d 75mg x4//52");
  });

  it("extracts dotted frequency abbreviations like b.d, b.d., o.d", () => {
    expect(extractFrequency("pregabalin T b.d 75mg x4//52").multiplier).toBe(2);
    expect(extractFrequency("pregabalin T b.d 75mg x4//52").label).toBe("twice daily");
    expect(extractFrequency("Tab Amlodipine 10mg dly x1/12").multiplier).toBe(1);
    expect(extractFrequency("Tab Amlodipine 10mg dly x1/12").label).toBe("once daily");
  });

  it("handles double-slash and fractions for duration", () => {
    const dur1 = extractDurationDays("Tab Amlodipine 10mg dly x1/12");
    expect(dur1.days).toBe(30);

    const dur2 = extractDurationDays("pregabalin T b.d 75mg x4//52");
    expect(dur2.days).toBe(28);
    expect(dur2.label).toBe("4 weeks");
  });

  it("normalizes dosages correctly", () => {
    expect(normalizeStrength("Amlodipine 10mg")).toBe("10mg");
    expect(normalizeStrength("pregabalin 75mg")).toBe("75mg");
    expect(normalizeStrength("metformin 1g")).toBe("1000mg");
  });

  it("matches items and calculates quantities via client fallback", async () => {
    const mockSupabase: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    code: "NHIA-12-04-03",
                    name: "Amlodipine Tablet (Besylate) 10mg Tab.",
                    category: "drug",
                    amount: 70,
                  },
                  {
                    code: "NHIA-12-04-02",
                    name: "Amlodipine Tablet (Besylate) 5mg Tab.",
                    category: "drug",
                    amount: 58,
                  },
                  {
                    code: "NHIA-05-01-17",
                    name: "Pregabalin Tablet 75mg Tablet",
                    category: "drug",
                    amount: 228,
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const text = "Services: 1 tab Amlodipine 10mg dly x1/12, 1 cap pregabalin T b.d 75mg x4//52";
    const results = await parsePrescriptionClientFallback(text, mockSupabase);

    expect(results.length).toBe(2);

    const amlodipine = results.find((r) => r.code === "NHIA-12-04-03");
    expect(amlodipine).toBeDefined();
    expect(amlodipine?.quantity).toBe(30);
    expect(amlodipine?.quantityNeedsReview).toBe(false);
    expect(amlodipine?.price).toBe(70 * 30);

    const pregabalin = results.find((r) => r.code === "NHIA-05-01-17");
    expect(pregabalin).toBeDefined();
    expect(pregabalin?.quantity).toBe(56);
    expect(pregabalin?.quantityNeedsReview).toBe(false);
    expect(pregabalin?.price).toBe(228 * 56);
  });

  it("flags a name-only medication quantity as provisional for reviewer confirmation", async () => {
    const mockSupabase: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{
                  code: "NHIA-12-04-03",
                  name: "Amlodipine Tablet (Besylate) 10mg Tab.",
                  category: "drug",
                  amount: 70,
                }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const results = await parsePrescriptionClientFallback(
      "Services: Amlodipine 10mg Tablet",
      mockSupabase,
    );

    expect(results).toHaveLength(1);
    expect(results[0].quantity).toBe(1);
    expect(results[0].quantityNeedsReview).toBe(true);
  });

  it("uses one unit for a service without an explicit quantity", async () => {
    const mockSupabase: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{
                  code: "NHIA-181-006",
                  name: "Creatinine",
                  category: "procedure",
                  amount: 2500,
                }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    const results = await parsePrescriptionClientFallback("Services: Creatinine", mockSupabase);

    expect(results).toHaveLength(1);
    expect(results[0].quantity).toBe(1);
    expect(results[0].quantityNeedsReview).toBe(false);
  });
});
