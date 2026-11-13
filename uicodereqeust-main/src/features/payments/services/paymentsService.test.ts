import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentsService } from "./paymentsService";

const queryState = vi.hoisted(() => ({ queries: [] as Array<{ table: string; columns: string; filters: Array<[string, ...unknown[]]> }> }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => {
        const query = { table, columns, filters: [] as Array<[string, ...unknown[]]> };
        queryState.queries.push(query);
        const builder: Record<string, unknown> = {};
        for (const method of ["eq", "in", "is", "or", "order", "range"]) {
          builder[method] = (...args: unknown[]) => {
            query.filters.push([method, ...args]);
            return builder;
          };
        }
        builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
        return builder;
      },
    }),
  },
}));

describe("PaymentsService report data contracts", () => {
  beforeEach(() => {
    queryState.queries.length = 0;
  });

  it("loads the fields needed to filter and export paid claims by payment date", async () => {
    await PaymentsService.getPaidClaims();

    const claimsQuery = queryState.queries.find((query) => query.table === "hospital_claims");
    expect(claimsQuery?.columns).toContain("paid_at");
    expect(claimsQuery?.columns).toContain("created_at");
    expect(claimsQuery?.columns).toContain("submitted_at");
  });

  it("keeps already settled claims out of the awaiting-payment query", async () => {
    await PaymentsService.getAwaitingPaymentClaims();

    const claimsQuery = queryState.queries.find((query) => query.table === "hospital_claims");
    expect(claimsQuery?.filters).toContainEqual(["is", "payment_batch_id", null]);
    expect(claimsQuery?.filters).toContainEqual(["or", "payment_status.is.null,payment_status.neq.paid"]);
  });

  it("loads complete claim and batch fields for accurate finance reports", async () => {
    await PaymentsService.getFinanceReports();

    const claimsQueries = queryState.queries.filter((query) => query.table === "hospital_claims");
    const awaitingQuery = claimsQueries.find((query) => query.filters.some(([method]) => method === "in"));
    const paidQuery = claimsQueries.find((query) => query.filters.some(([method, expression]) => method === "or" && expression === "payment_status.eq.paid,status.eq.paid"));
    const batchQuery = queryState.queries.find((query) => query.table === "payment_batches");

    expect(awaitingQuery?.columns).toContain("status");
    expect(awaitingQuery?.columns).toContain("contest_deadline");
    expect(awaitingQuery?.columns).toContain("claim_number");
    expect(awaitingQuery?.filters).toContainEqual(["in", "status", ["approved", "partially_approved"]]);
    expect(awaitingQuery?.filters).toContainEqual(["or", "payment_status.is.null,payment_status.neq.paid"]);
    expect(paidQuery?.columns).toContain("paid_at");
    expect(paidQuery?.columns).toContain("hospital_name");
    expect(paidQuery?.columns).toContain("submitted_at");
    expect(batchQuery?.columns).toContain("total_claims");
    expect(batchQuery?.columns).toContain("created_at");
    expect(batchQuery?.columns).toContain("paid_at");
  });
});
