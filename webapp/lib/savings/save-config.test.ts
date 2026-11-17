import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { SaveConfigError, saveGoalsConfig, savePoolsConfig } from "@/lib/savings/save-config";
import type { SavingsGoal, SavingsPool } from "@/lib/savings/types";

const HH = "11111111-1111-4111-8111-111111111111";
const ME = "22222222-2222-4222-8222-222222222222";
const POOL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const POOL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GOAL_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GOAL_S = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function seed() {
  return {
    savings_pools: [
      { id: POOL_A, household_id: HH, name: "Joint", balance: 1234.5, notes: "", include_in_savings: true, sort_order: 0 },
      { id: POOL_B, household_id: HH, name: "Trip", balance: 50, notes: "", include_in_savings: true, sort_order: 1 },
    ],
    savings_goals: [
      { id: GOAL_A, scope: "individual", owner_user_id: ME, household_id: null, name: "Car", target_amount: 100, saved_amount: 40, sort_order: 0 },
      { id: GOAL_S, scope: "shared", owner_user_id: null, household_id: HH, name: "House", target_amount: 900, saved_amount: 300, sort_order: 0 },
    ],
    savings_transactions: [
      { id: "t1", pool_id: POOL_A, goal_id: GOAL_A },
      { id: "t2", pool_id: POOL_A, goal_id: null },
    ],
  };
}

const pool = (o: Partial<SavingsPool>): Partial<SavingsPool> => ({
  name: "x", notes: "", includeInSavings: true, sortOrder: 0, ...o,
});
const goal = (o: Partial<SavingsGoal>): Partial<SavingsGoal> => ({
  scope: "individual", name: "x", targetAmount: 1, ...o,
});

describe("savePoolsConfig", () => {
  it("never deletes pools omitted from the payload", async () => {
    const f = createFakeSupabase(seed());
    await savePoolsConfig(f.client, HH, [pool({ id: POOL_A, name: "Renamed" })], undefined);
    expect(f.deletes()).toHaveLength(0);
    expect(f.table("savings_pools").map((r) => r.id)).toEqual([POOL_A, POOL_B]);
  });

  it("updates in place, keeping id and ledger, and never writes balance", async () => {
    const f = createFakeSupabase(seed());
    await savePoolsConfig(
      f.client, HH,
      [pool({ id: POOL_A, name: "Renamed", balance: 999999 }), pool({ id: POOL_B })],
      []
    );
    const a = f.table("savings_pools").find((r) => r.id === POOL_A)!;
    expect(a.name).toBe("Renamed");
    expect(a.balance).toBe(1234.5);
    expect(f.table("savings_transactions")).toHaveLength(2);
    expect(f.ops.some((o) => o.kind === "insert")).toBe(false);
  });

  it("inserts only rows without a persisted id, with zero balance", async () => {
    const f = createFakeSupabase(seed());
    await savePoolsConfig(
      f.client, HH,
      [pool({ id: POOL_A }), pool({ id: POOL_B }), pool({ id: "new-pool-2", balance: 500 })],
      []
    );
    const rows = f.table("savings_pools");
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === "new-pool-2")).toBeUndefined();
    expect(rows[2].balance).toBe(0);
  });

  it("deletes only explicitly removed pools without history", async () => {
    const f = createFakeSupabase(seed());
    await savePoolsConfig(f.client, HH, [pool({ id: POOL_A })], [POOL_B]);
    expect(f.table("savings_pools").map((r) => r.id)).toEqual([POOL_A]);
  });

  it("refuses to delete a pool that still has ledger transactions", async () => {
    const f = createFakeSupabase(seed());
    await expect(
      savePoolsConfig(f.client, HH, [pool({ id: POOL_B })], [POOL_A])
    ).rejects.toMatchObject({ status: 409 });
    expect(f.deletes("savings_pools")).toHaveLength(0);
    expect(f.table("savings_transactions")).toHaveLength(2);
  });

  it("errors instead of inserting when an id no longer exists", async () => {
    const f = createFakeSupabase(seed());
    const gone = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await expect(savePoolsConfig(f.client, HH, [pool({ id: gone })], [])).rejects.toBeInstanceOf(SaveConfigError);
    expect(f.table("savings_pools")).toHaveLength(2);
  });
});

describe("saveGoalsConfig", () => {
  it("preserves ids and goal_id links when saving goals", async () => {
    const f = createFakeSupabase(seed());
    await saveGoalsConfig(
      f.client, ME, HH,
      [goal({ id: GOAL_A, name: "New car", targetAmount: 200 }), goal({ id: GOAL_S, scope: "shared", name: "Home" })],
      []
    );
    expect(f.deletes()).toHaveLength(0);
    const a = f.table("savings_goals").find((r) => r.id === GOAL_A)!;
    expect(a.name).toBe("New car");
    expect(a.target_amount).toBe(200);
    expect(f.table("savings_transactions").find((t) => t.id === "t1")!.goal_id).toBe(GOAL_A);
  });

  it("never overwrites saved_amount from the form", async () => {
    const f = createFakeSupabase(seed());
    await saveGoalsConfig(f.client, ME, HH, [goal({ id: GOAL_A, savedAmount: 0 })], []);
    expect(f.table("savings_goals").find((r) => r.id === GOAL_A)!.saved_amount).toBe(40);
  });

  it("does not delete goals omitted from the payload (incl. partner-visible shared goals)", async () => {
    const f = createFakeSupabase(seed());
    await saveGoalsConfig(f.client, ME, HH, [], undefined);
    expect(f.deletes()).toHaveLength(0);
    expect(f.table("savings_goals")).toHaveLength(2);
  });

  it("inserts new goals with zero saved_amount and deletes only listed ids", async () => {
    const f = createFakeSupabase(seed());
    await saveGoalsConfig(
      f.client, ME, HH,
      [goal({ id: "new-goal-1", savedAmount: 777 }), goal({ id: GOAL_S, scope: "shared" })],
      [GOAL_A]
    );
    const rows = f.table("savings_goals");
    expect(rows.map((r) => r.id)).not.toContain(GOAL_A);
    expect(rows).toHaveLength(2);
    const added = rows.find((r) => r.id !== GOAL_S)!;
    expect(added.saved_amount).toBe(0);
    expect(added.owner_user_id).toBe(ME);
  });

  it("cannot update or delete another user's individual goal", async () => {
    const f = createFakeSupabase(seed());
    await saveGoalsConfig(f.client, "someone-else", HH, [], [GOAL_A]);
    expect(f.table("savings_goals").map((r) => r.id)).toContain(GOAL_A);
  });
});
