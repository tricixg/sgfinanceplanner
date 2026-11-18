import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { withLatency } from "@/lib/test-utils/latency-supabase";
import { loadSavingsBundle } from "@/lib/savings/load-bundle";

const USER = "u1";
const PARTNER = "u2";
const HH = "11111111-1111-4111-8111-111111111111";

const seed = {
  household_members: [
    { household_id: HH, user_id: USER },
    { household_id: HH, user_id: PARTNER },
  ],
  savings_pools: [{ id: "p1", household_id: HH, name: "Joint", balance: 100, sort_order: 0 }],
  savings_goals: [
    { id: "g1", scope: "individual", owner_user_id: USER, name: "Mine", target_amount: 10, saved_amount: 1, sort_order: 0 },
    { id: "g2", scope: "individual", owner_user_id: PARTNER, name: "Theirs", target_amount: 10, saved_amount: 1, sort_order: 0 },
    { id: "g3", scope: "shared", household_id: HH, name: "Shared", target_amount: 20, saved_amount: 2, sort_order: 0 },
    { id: "g4", scope: "shared", household_id: "other", name: "Other HH", target_amount: 20, saved_amount: 2, sort_order: 0 },
  ],
};

describe("loadSavingsBundle", () => {
  it("returns the user's individual goals, the household's shared goals and pools, and members", async () => {
    const f = createFakeSupabase(seed);
    const bundle = await loadSavingsBundle(f.client, USER);
    expect(bundle.householdId).toBe(HH);
    expect(bundle.paired).toBe(true);
    expect(bundle.members.map((m) => m.userId).sort()).toEqual([USER, PARTNER]);
    expect(bundle.pools.map((p) => p.id)).toEqual(["p1"]);
    // individual goals first, then shared — the order callers have always received
    expect(bundle.goals.map((g) => g.id)).toEqual(["g1", "g3"]);
  });

  it("needs only two sequential round-trips (household lookup, then everything that depends on it)", async () => {
    const f = createFakeSupabase(seed);
    const timed = withLatency(f.client);
    await loadSavingsBundle(timed.client, USER);
    expect(timed.calls).toHaveLength(5);
    expect(timed.depth()).toBe(2);
  });

  it("still surfaces a failed query instead of returning a partial bundle", async () => {
    const f = createFakeSupabase(seed, {
      failOn: (op) => (op.table === "savings_pools" ? "boom" : null),
    });
    await expect(loadSavingsBundle(f.client, USER)).rejects.toMatchObject({ message: "boom" });
  });
});
