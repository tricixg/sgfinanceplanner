import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./fetch-all";
import { createFakeReadSupabase, FAKE_MAX_ROWS } from "@/lib/test-utils/fake-supabase-reads";

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i).padStart(6, "0"),
    spent_at: "2026-01-01",
    amount: 1,
  }));
}

describe("fetchAllRows", () => {
  it("the fake backend really truncates an unpaged query at 1,000 rows", async () => {
    const { client } = createFakeReadSupabase({ expenses: rows(2500) });
    const { data } = await client.from("expenses").select("id");
    expect(data).toHaveLength(FAKE_MAX_ROWS);
  });

  it.each([0, 1, 999, 1000, 1001, 2500, 3000])("returns all %i rows", async (n) => {
    const { client } = createFakeReadSupabase({ expenses: rows(n) });
    const all = await fetchAllRows((from, to) =>
      client.from("expenses").select("id").order("spent_at").order("id").range(from, to)
    );
    expect(all).toHaveLength(n);
    expect(new Set(all.map((r: { id: string }) => r.id)).size).toBe(n);
  });

  it("throws on a page error instead of returning a partial result", async () => {
    await expect(
      fetchAllRows(async () => ({ data: null, error: { message: "boom" } }))
    ).rejects.toThrow("boom");
  });
});
