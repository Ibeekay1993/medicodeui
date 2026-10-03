import { describe, expect, it } from "vitest";
import { calculateApprovedAmount } from "./reports-helpers";

describe("calculateApprovedAmount", () => {
  it("adds approved cart line totals and excludes declined items", () => {
    expect(calculateApprovedAmount({
      status: "partially_approved",
      approved_items: [
        { amount: 1200.25, quantity: 1 },
        { unit_price: 300, quantity: 2 },
        { amount: 500, declined: true },
      ],
      total_amount: 1800.25,
    })).toBe(1800.25);
  });

  it("keeps an explicit zero cart total instead of falling back to stale amounts", () => {
    expect(calculateApprovedAmount({
      status: "approved",
      approved_items: [{ amount: 900, declined: true }],
      total_amount: 900,
      approved_tariff_amount: 900,
    })).toBe(0);
  });

  it("uses the stored approved total before the first tariff line when cart details are absent", () => {
    expect(calculateApprovedAmount({
      status: "approved",
      approved_items: [],
      total_amount: 1750,
      approved_tariff_amount: 750,
    })).toBe(1750);
  });

  it("does not report a payable amount for a pending request", () => {
    expect(calculateApprovedAmount({ status: "pending", total_amount: 1200 })).toBe(0);
  });
});
