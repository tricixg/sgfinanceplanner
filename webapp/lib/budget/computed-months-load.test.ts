import { describe, expect, it } from "vitest";
import { createFakeReadSupabase } from "@/lib/test-utils/fake-supabase-reads";
import { loadComputedMonths, resolveComputedLinesForMonth } from "./computed-months-load";
import type { SupabaseClient } from "@supabase/supabase-js";

const live = { insurance: 250, ilp: 400, debt: 90 };

describe("loadComputedMonths", () => {
  it("maps rows by month and pages past 1,000 rows", async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      user_id: "u1",
      month: `${1900 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
      insurance: 1,
      ilp: 2,
      debt: 3,
    }));
    const { client } = createFakeReadSupabase({ monthly_computed_lines: rows });
    const map = await loadComputedMonths(client, "u1");
    expect(Object.keys(map)).toHaveLength(1200);
    expect(map["1900-01"]).toEqual({ insurance: 1, ilp: 2, debt: 3 });
  });

  it("returns {} (live settings) when migration 068 hasn't been applied", async () => {
    const client = {
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order"]) q[m] = () => q;
        q.range = () => Promise.resolve({ data: null, error: { code: "42P01", message: 'relation "monthly_computed_lines" does not exist' } });
        return q;
      },
    } as unknown as SupabaseClient;
    expect(await loadComputedMonths(client, "u1")).toEqual({});
  });

  it("rethrows unrelated errors", async () => {
    const client = {
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order"]) q[m] = () => q;
        q.range = () => Promise.resolve({ data: null, error: { message: "permission denied" } });
        return q;
      },
    } as unknown as SupabaseClient;
    await expect(loadComputedMonths(client, "u1")).rejects.toThrow("permission denied");
  });
});

describe("resolveComputedLinesForMonth", () => {
  const { client } = createFakeReadSupabase({
    monthly_computed_lines: [{ user_id: "u1", month: "2026-09", insurance: 10, ilp: 20, debt: 30 }],
  });

  it("uses the snapshot for a finished month", async () => {
    expect(await resolveComputedLinesForMonth(client, "u1", "2026-09", live, "2026-11")).toEqual({
      insurance: 10,
      ilp: 20,
      debt: 30,
    });
  });
  it("uses live settings for the current month and for finished months without a snapshot", async () => {
    expect(await resolveComputedLinesForMonth(client, "u1", "2026-11", live, "2026-11")).toEqual(live);
    expect(await resolveComputedLinesForMonth(client, "u1", "2026-08", live, "2026-11")).toEqual(live);
  });
});
