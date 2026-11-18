import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { withLatency } from "@/lib/test-utils/latency-supabase";
import { loadSplitsForExpenses } from "@/lib/travel/load";

describe("loadSplitsForExpenses", () => {
  it("loads splits and shares together (one round-trip) and skips the DB for no expenses", async () => {
    const f = createFakeSupabase({
      travel_expense_splits: [{ id: "s1", user_id: "u1", expense_id: "e1" }],
      travel_expense_split_shares: [{ id: "h1", user_id: "u1", expense_id: "e1", companion_id: "c1", share_amount: 5 }],
    });
    const timed = withLatency(f.client);
    const map = await loadSplitsForExpenses(timed.client, "u1", ["e1"]);
    expect(map.has("e1")).toBe(true);
    expect(timed.calls).toHaveLength(2);
    expect(timed.depth()).toBe(1);

    const none = withLatency(createFakeSupabase().client);
    expect((await loadSplitsForExpenses(none.client, "u1", [])).size).toBe(0);
    expect(none.calls).toHaveLength(0);
  });
});
