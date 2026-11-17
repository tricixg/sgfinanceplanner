/**
 * PostgREST (Supabase) returns at most `max_rows` (default 1,000) rows per
 * request and does NOT error when it truncates. Any query that feeds a sum or
 * an analytic must therefore page through the full result with `.range()`.
 *
 * `buildPage(from, to)` must return the query for that inclusive row range and
 * MUST include a deterministic `order` (a date column, then `id`) — without it
 * Postgres may return overlapping/missing rows between pages.
 *
 *   fetchAllRows((from, to) =>
 *     supabase.from("expenses").select("id, amount, spent_at")
 *       .eq("user_id", userId)
 *       .order("spent_at").order("id")
 *       .range(from, to)
 *   )
 *
 * Paging stops at the first short page, so the page size must not exceed the
 * project's `max_rows` (Supabase default 1,000).
 */
export const FETCH_ALL_PAGE_SIZE = 1000;

/** Safety stop: 500 pages = 500k rows. Throws instead of looping forever. */
const MAX_PAGES = 500;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = FETCH_ALL_PAGE_SIZE
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * pageSize;
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
  throw new Error(`fetchAllRows: exceeded ${MAX_PAGES} pages`);
}
