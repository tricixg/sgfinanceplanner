import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { withLatency } from "@/lib/test-utils/latency-supabase";
import { listTravelExpensesForTrips, loadSplitsForExpenses } from "@/lib/travel/load";
import { buildTravelTripSummaries } from "@/lib/travel/summary";
import type { TravelTrip } from "@/lib/travel/types";

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

describe("listTravelExpensesForTrips", () => {
  const perth: TravelTrip = {
    id: "t1",
    userId: "u1",
    name: "Perth 2027",
    country: "Australia",
    startDate: "2027-03-01",
    endDate: "2027-03-08",
    status: "planned",
    sortOrder: 0,
  };
  const expense = (id: string, note: string, spentAt: string, amount = 100, category = "Travel") => ({
    id,
    user_id: "u1",
    category,
    amount,
    note,
    spent_at: spentAt,
  });

  it("counts expenses tagged to the trip whatever year they are dated (flights booked a year early)", async () => {
    const f = createFakeSupabase({
      expenses: [
        expense("e1", "Perth 2027 - Flights", "2026-11-20", 600),
        expense("e2", "Perth 2027 - Accoms · deposit", "2027-01-05", 200),
        expense("e3", "Japan Spring - Flights", "2026-11-20", 900),
        expense("e4", "Perth 2027 - Flights", "2026-11-21", 50, "Food"),
      ],
    });
    const expenses = await listTravelExpensesForTrips(f.client, "u1", [perth]);
    expect(expenses.map((e) => e.id).sort()).toEqual(["e1", "e2"]);

    const [summary] = buildTravelTripSummaries([perth], [], expenses, new Map());
    expect(summary.spent).toBe(800);
  });

  it("skips the DB when there are no trips", async () => {
    const timed = withLatency(createFakeSupabase().client);
    expect(await listTravelExpensesForTrips(timed.client, "u1", [])).toEqual([]);
    expect(timed.calls).toHaveLength(0);
  });
});
