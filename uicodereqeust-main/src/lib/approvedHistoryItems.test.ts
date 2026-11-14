import { describe, expect, it } from "vitest";
import { getApprovedHistoryItems } from "./approvedHistoryItems";

describe("approved authorization history items", () => {
  it("shows each saved approved item with its approved quantity and instructions", () => {
    expect(getApprovedHistoryItems([
      {
        code: "NHIA-12-04-05",
        name: "Amlodipine 10mg tablet",
        category: "Medication",
        quantity: 30,
        quantity_requires_review: false,
        frequency: "Once daily",
        duration: "30 days",
      },
      { name: "Lumbar X-ray", quantity: 1, unit: "service" },
    ])).toEqual([
      {
        code: "NHIA-12-04-05",
        name: "Amlodipine 10mg tablet",
        category: "Medication",
        quantity: 30,
        quantityNeedsReview: false,
        unit: null,
        frequency: "Once daily",
        duration: "30 days",
      },
      {
        code: null,
        name: "Lumbar X-ray",
        category: null,
        quantity: 1,
        quantityNeedsReview: false,
        unit: "service",
        frequency: null,
        duration: null,
      },
    ]);
  });

  it("excludes declined lines and does not invent a quantity when none was recorded", () => {
    expect(getApprovedHistoryItems([
      { name: "Approved item", quantity: "2" },
      { name: "Declined item", quantity: 5, declined: true },
      { name: "Item with missing quantity" },
      { name: "Invalid quantity", quantity: "not recorded" },
    ])).toEqual([
      {
        name: "Approved item",
        code: null,
        category: null,
        quantity: 2,
        quantityNeedsReview: false,
        unit: null,
        frequency: null,
        duration: null,
      },
      {
        name: "Item with missing quantity",
        code: null,
        category: null,
        quantity: null,
        quantityNeedsReview: true,
        unit: null,
        frequency: null,
        duration: null,
      },
      {
        name: "Invalid quantity",
        code: null,
        category: null,
        quantity: null,
        quantityNeedsReview: true,
        unit: null,
        frequency: null,
        duration: null,
      },
    ]);
  });

  it("returns no structured items for empty, malformed, or non-array history data", () => {
    expect(getApprovedHistoryItems(null)).toEqual([]);
    expect(getApprovedHistoryItems("not json")).toEqual([]);
    expect(getApprovedHistoryItems([{ declined: false }])).toEqual([]);
  });
});
