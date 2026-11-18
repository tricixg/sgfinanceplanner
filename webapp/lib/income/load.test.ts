import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadIncomeCategories } from "@/lib/income/load";
import { DEFAULT_INCOME_CATEGORIES } from "@/lib/income/defaults";

/** Fake client: `selects` is the sequence of rows each SELECT returns. */
function fakeClient(selects: Record<string, unknown>[][], upsertError: { message: string } | null = null) {
  const calls = { select: 0, upsert: 0, upsertOptions: null as unknown, upsertRows: 0 };
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                order: async () => {
                  const rows = selects[Math.min(calls.select, selects.length - 1)] ?? [];
                  calls.select += 1;
                  return { data: rows, error: null };
                },
              };
            },
          };
        },
        upsert: async (rows: unknown[], options: unknown) => {
          calls.upsert += 1;
          calls.upsertRows = rows.length;
          calls.upsertOptions = options;
          return { error: upsertError };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const row = { id: "c1", user_id: "u", name: "Salary", slug: "salary", sort_order: 0 };

describe("loadIncomeCategories (DATA-006)", () => {
  it("returns existing categories without seeding", async () => {
    const { client, calls } = fakeClient([[row]]);
    expect((await loadIncomeCategories(client, "u")).map((c) => c.slug)).toEqual(["salary"]);
    expect(calls).toMatchObject({ select: 1, upsert: 0 });
  });

  it("seeds once on first use, idempotently (ON CONFLICT (user_id, slug) DO NOTHING)", async () => {
    const { client, calls } = fakeClient([[], [row]]);
    expect(await loadIncomeCategories(client, "u")).toHaveLength(1);
    expect(calls.upsert).toBe(1);
    expect(calls.upsertRows).toBe(DEFAULT_INCOME_CATEGORIES.length);
    expect(calls.upsertOptions).toEqual({ onConflict: "user_id,slug", ignoreDuplicates: true });
  });

  it("insert succeeds but the read stays empty → throws after 2 reads + 1 write (was unbounded recursion)", async () => {
    const { client, calls } = fakeClient([[]]);
    await expect(loadIncomeCategories(client, "u")).rejects.toThrow("Income categories could not be loaded");
    expect(calls).toMatchObject({ select: 2, upsert: 1 });
  });

  it("a failing seed surfaces its error instead of retrying", async () => {
    const { client, calls } = fakeClient([[]], { message: "boom" });
    await expect(loadIncomeCategories(client, "u")).rejects.toThrow("boom");
    expect(calls).toMatchObject({ select: 1, upsert: 1 });
  });
});
