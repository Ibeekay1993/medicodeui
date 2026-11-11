import { describe, expect, it } from "vitest";
import { resolveParsedTariffPrices } from "@/lib/resolveParsedTariffPrices";
import type { TariffOption } from "@/lib/clinicalUtils";

const code = "NHIA-12-04-03";
const parsedItem: TariffOption = {
  code,
  name: "Amlodipine 10mg",
  category: "drug",
  unitPrice: 0,
  price: 0,
  quantity: 30,
  quantityNeedsReview: false,
  priceNeedsReview: true,
  matched_via: "auto",
};

describe("resolveParsedTariffPrices", () => {
  it("uses the active catalogue unit price and recalculates the line total", () => {
    const [resolved] = resolveParsedTariffPrices([parsedItem], [{
      code,
      name: "Amlodipine Tablet (Besylate) 10mg Tab.",
      category: "drug",
      amount: 70,
    }]);

    expect(resolved).toMatchObject({
      name: "Amlodipine Tablet (Besylate) 10mg Tab.",
      unitPrice: 70,
      quantity: 30,
      price: 2100,
      priceNeedsReview: false,
      quantityNeedsReview: false,
    });
  });

  it("blocks missing, invalid, and ambiguous catalogue rows without retaining parser prices", () => {
    const missing = resolveParsedTariffPrices([{ ...parsedItem, price: 9000, unitPrice: 300 }], [])[0];
    const invalid = resolveParsedTariffPrices([parsedItem], [{ code, name: "Amlodipine", category: "drug", amount: "not a price" }])[0];
    const ambiguous = resolveParsedTariffPrices([parsedItem], [
      { code, name: "Amlodipine A", category: "drug", amount: 70 },
      { code, name: "Amlodipine B", category: "drug", amount: 75 },
    ])[0];

    for (const item of [missing, invalid, ambiguous]) {
      expect(item.unitPrice).toBe(0);
      expect(item.price).toBe(0);
      expect(item.priceNeedsReview).toBe(true);
    }
  });

  it("keeps a valid catalogue unit price but leaves an invalid quantity for staff review", () => {
    const [resolved] = resolveParsedTariffPrices([{ ...parsedItem, quantity: 0, quantityNeedsReview: true }], [{
      code,
      name: "Amlodipine",
      category: "drug",
      amount: 70,
    }]);

    expect(resolved.unitPrice).toBe(70);
    expect(resolved.price).toBe(0);
    expect(resolved.priceNeedsReview).toBe(false);
    expect(resolved.quantityNeedsReview).toBe(true);
  });
});
