import { describe, expect, it, vi } from "vitest";
import { fetchAllSupabaseRows, SUPABASE_PAGE_SIZE } from "./supabasePagination";

describe("fetchAllSupabaseRows", () => {
  it("continues through the PostgREST row cap until all rows are read", async () => {
    const loadPage = vi.fn(async (from: number) => ({
      data: from === 0 ? Array.from({ length: SUPABASE_PAGE_SIZE }, (_, index) => index) : [1000],
      error: null,
    }));

    await expect(fetchAllSupabaseRows(loadPage)).resolves.toHaveLength(1001);
    expect(loadPage).toHaveBeenNthCalledWith(1, 0, 999);
    expect(loadPage).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("throws page errors instead of returning an incomplete report", async () => {
    await expect(fetchAllSupabaseRows(async () => ({ data: null, error: new Error("page failed") })))
      .rejects.toThrow("page failed");
  });
});
