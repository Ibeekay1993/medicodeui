export const SUPABASE_PAGE_SIZE = 1000;
const MAX_ROWS_PER_CLIENT_READ = 50_000;

type PageResponse<T> = {
  data: T[] | null;
  error: unknown | null;
};

/** Read every API page explicitly so Supabase's row cap cannot silently truncate reports. */
export async function fetchAllSupabaseRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<PageResponse<T>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;

    const page = data || [];
    if (rows.length + page.length > MAX_ROWS_PER_CLIENT_READ) {
      throw new Error("This report exceeds the 50,000-row export limit. Narrow the date range and retry.");
    }
    rows.push(...page);
    if (page.length < SUPABASE_PAGE_SIZE) return rows;
  }
}
