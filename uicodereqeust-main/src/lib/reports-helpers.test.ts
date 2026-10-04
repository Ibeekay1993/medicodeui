import { describe, expect, it } from "vitest";
import {
  calculateApprovedAmount,
  calculateHospitalPerformance,
  calculateReportStats,
  fetchAllReportPages,
  getReportStatusPredicate,
  groupByDate,
  PreAuthRecord,
} from "./reports-helpers";

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

describe("authorization report pagination", () => {
  it("returns an empty result when the first page is empty", async () => {
    const fetchPage = vi.fn().mockResolvedValue({ data: [], error: null });
    await expect(fetchAllReportPages(fetchPage)).resolves.toEqual([]);
    expect(fetchPage).toHaveBeenCalledWith({ from: 0, to: 999 });
  });

  it("returns one row and stops for a short first page", async () => {
    const fetchPage = vi.fn().mockResolvedValue({ data: ["one"], error: null });
    await expect(fetchAllReportPages(fetchPage)).resolves.toEqual(["one"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("supports page sizes below 1,000 while retaining offset ranges", async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ data: [1, 2], error: null })
      .mockResolvedValueOnce({ data: [3], error: null });
    await expect(fetchAllReportPages(fetchPage, 2)).resolves.toEqual([1, 2, 3]);
    expect(fetchPage.mock.calls).toEqual([[{ from: 0, to: 1 }], [{ from: 2, to: 3 }]]);
  });

  it("fetches exactly 1,000 rows then the terminating empty page", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => index);
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    await expect(fetchAllReportPages(fetchPage)).resolves.toHaveLength(1000);
    expect(fetchPage.mock.calls).toEqual([[{ from: 0, to: 999 }], [{ from: 1000, to: 1999 }]]);
  });

  it("fetches multiple full pages followed by a short page in deterministic order", async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ data: [0, 1], error: null })
      .mockResolvedValueOnce({ data: [2, 3], error: null })
      .mockResolvedValueOnce({ data: [4], error: null });
    await expect(fetchAllReportPages(fetchPage, 2)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(fetchPage.mock.calls).toEqual([
      [{ from: 0, to: 1 }],
      [{ from: 2, to: 3 }],
      [{ from: 4, to: 5 }],
    ]);
  });

  it.each([0, 1, 2, 3])("fails closed when page %i fails", async (failedPage) => {
    const fetchPage = vi.fn(async ({ from }: { from: number }) => {
      const page = from / 2;
      if (page === failedPage) return { data: null, error: new Error(`page ${page} failed`) };
      return { data: [page * 2, page * 2 + 1], error: null };
    });
    await expect(fetchAllReportPages(fetchPage, 2)).rejects.toThrow(`page ${failedPage} failed`);
    expect(fetchPage).toHaveBeenCalledTimes(failedPage + 1);
  });

  it("starts retries at offset zero with a fresh accumulator", async () => {
    const retryFetch = vi.fn()
      .mockResolvedValueOnce({ data: ["partial"], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("second page failed") })
      .mockResolvedValueOnce({ data: ["complete", "result"], error: null });

    await expect(fetchAllReportPages(retryFetch, 1)).rejects.toThrow("second page failed");
    await expect(fetchAllReportPages(retryFetch, 3)).resolves.toEqual(["complete", "result"]);
    expect(retryFetch.mock.calls.map(([range]) => range)).toEqual([
      { from: 0, to: 0 },
      { from: 1, to: 1 },
      { from: 0, to: 2 },
    ]);
  });
});

describe("report status filters", () => {
  it("applies an exact status predicate for Partially Approved", () => {
    expect(getReportStatusPredicate("partially_approved")).toEqual({ operator: "eq", value: "partially_approved" });
  });

  it("preserves existing grouped status predicates", () => {
    expect(getReportStatusPredicate("approved")).toEqual({
      operator: "in",
      values: ["approved", "partially_approved", "referral_approved", "referral_accepted", "authorization_approved"],
    });
    expect(getReportStatusPredicate("all")).toBeNull();
  });
});

describe("existing report calculations", () => {
  const records: PreAuthRecord[] = [
    {
      id: "a", created_at: "2026-10-01T10:00:00.000Z", request_id: "A", patient_name: "A", patient_phone: "", patient_email: "", policy_number: "", diagnosis: "", treatment: "", requesting_hospital: "Hospital A", source: "Manual", authorization_code: "", status: "approved", approved_amount: 100, rejection_reason: "", decision_reason: "", decided_at: "2026-10-01T11:00:00.000Z",
    },
    {
      id: "b", created_at: "2026-10-01T12:00:00.000Z", request_id: "B", patient_name: "B", patient_phone: "", patient_email: "", policy_number: "", diagnosis: "", treatment: "", requesting_hospital: "Hospital A", source: "Manual", authorization_code: "", status: "partially_approved" as PreAuthRecord["status"], approved_amount: 50, rejection_reason: "", decision_reason: "", decided_at: "2026-10-01T12:30:00.000Z",
    },
    {
      id: "c", created_at: "2026-10-02T12:00:00.000Z", request_id: "C", patient_name: "C", patient_phone: "", patient_email: "", policy_number: "", diagnosis: "", treatment: "", requesting_hospital: "Hospital B", source: "Manual", authorization_code: "", status: "rejected", approved_amount: 0, rejection_reason: "", decision_reason: "", decided_at: "2026-10-02T12:15:00.000Z",
    },
    {
      id: "d", created_at: "2026-10-02T13:00:00.000Z", request_id: "D", patient_name: "D", patient_phone: "", patient_email: "", policy_number: "", diagnosis: "", treatment: "", requesting_hospital: "Hospital B", source: "Manual", authorization_code: "", status: "pending", approved_amount: 0, rejection_reason: "", decision_reason: "",
    },
  ];

  it("preserves total, status counts, amount, rates, average time, and daily volume", () => {
    expect(calculateReportStats(records)).toEqual({
      totalCodes: 4,
      approvedCodes: 2,
      pendingCodes: 1,
      rejectedCodes: 1,
      approvedAmount: 150,
      approvalRate: 50,
      rejectionRate: 25,
      avgProcessingTime: (1.75 / 3),
      dailyVolume: 2,
    });
  });

  it("preserves hospital breakdown and daily trend calculations", () => {
    expect(calculateHospitalPerformance(records)).toEqual([
      { hospital: "Hospital A", totalCodes: 2, approvedCodes: 2, rejectedCodes: 0, pendingCodes: 0, approvedAmount: 150, approvalRate: 100 },
      { hospital: "Hospital B", totalCodes: 2, approvedCodes: 0, rejectedCodes: 1, pendingCodes: 1, approvedAmount: 0, approvalRate: 0 },
    ]);
    expect(groupByDate(records, "day")).toEqual([
      { date: "2026-10-01", approved: 2, rejected: 0, pending: 0, approvedAmount: 150 },
      { date: "2026-10-02", approved: 0, rejected: 1, pending: 1, approvedAmount: 0 },
    ]);
  });
});
