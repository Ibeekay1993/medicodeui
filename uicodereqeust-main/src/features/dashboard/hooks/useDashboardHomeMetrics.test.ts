// src/features/dashboard/hooks/useDashboardHomeMetrics.test.ts
import { describe, expect, it } from "vitest";
import {
  money,
  compactMoney,
  parseAggregateNumber,
  parseActivityRows,
  groupLegacyRejectedStatuses,
  formatCount,
  APPROVED_AUTHORIZATION_STATUSES,
  REJECTED_AUTHORIZATION_STATUSES,
} from "./useDashboardHomeMetrics";

describe("useDashboardHomeMetrics helpers", () => {
  it("formats standard money into Nigerian Naira format", () => {
    const formatted = money(50000);
    expect(formatted).toContain("50,000");
  });

  it("formats compact money for summary cards", () => {
    const formatted = compactMoney(1500000);
    expect(formatted).toBeTruthy();
    expect(formatted).toMatch(/1\.5/);
  });

  it("parses aggregate numbers safely, returning NaN for invalid inputs", () => {
    expect(parseAggregateNumber(42)).toBe(42);
    expect(parseAggregateNumber("100")).toBe(100);
    expect(Number.isNaN(parseAggregateNumber(""))).toBe(true);
    expect(Number.isNaN(parseAggregateNumber("  "))).toBe(true);
    expect(Number.isNaN(parseAggregateNumber(null))).toBe(true);
    expect(Number.isNaN(parseAggregateNumber(undefined))).toBe(true);
    expect(Number.isNaN(parseAggregateNumber("not-a-number"))).toBe(true);
  });

  it("parses 7-day activity rows and discards malformed payloads", () => {
    const validRows = [
      { day: "2026-11-20", day_label: "Thu 20 Nov", volume: 15, approved: 10 },
      { day: "2026-11-21", day_label: "Fri 21 Nov", volume: 20, approved: 18 },
    ];
    const parsed = parseActivityRows(validRows);
    expect(parsed).toHaveLength(2);
    expect(parsed?.[0].volume).toBe(15);
    expect(parsed?.[0].tickLabel).toBe("20 Nov");

    const invalidRows = [
      { day: "2026-11-20", volume: -5, approved: 10 },
    ];
    expect(parseActivityRows(invalidRows)).toBeNull();
  });

  it("groups legacy rejected statuses (declined, denied) into rejected", () => {
    const rawCounts = [
      { status: "approved", count: 12 },
      { status: "declined", count: 3 },
      { status: "denied", count: 2 },
      { status: "rejected", count: 5 },
    ];
    const grouped = groupLegacyRejectedStatuses(rawCounts);
    const rejectedEntry = grouped.find((g) => g.status === "rejected");
    expect(rejectedEntry?.count).toBe(10); // 3 + 2 + 5
  });

  it("formats counts or displays an em-dash placeholder on error", () => {
    expect(formatCount(1234, false)).toBe("1,234");
    expect(formatCount(1234, true)).toBe("—");
    expect(formatCount(Number.NaN, false)).toBe("—");
  });

  it("maintains approved and rejected status membership sets", () => {
    expect(APPROVED_AUTHORIZATION_STATUSES.has("approved")).toBe(true);
    expect(APPROVED_AUTHORIZATION_STATUSES.has("referral_approved")).toBe(true);
    expect(REJECTED_AUTHORIZATION_STATUSES.has("rejected")).toBe(true);
    expect(REJECTED_AUTHORIZATION_STATUSES.has("referral_declined")).toBe(true);
  });
});
