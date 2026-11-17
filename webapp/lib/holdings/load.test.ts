import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { saveHoldings } from "@/lib/holdings/load";
import type { Holding } from "@/lib/types";

vi.mock("@/lib/holdings/dividends", () => ({
  loadHoldingDividendTotals: vi.fn(async () => ({ byHolding: {} })),
}));

const USER = "u1";
const H1 = "11111111-1111-4111-8111-111111111111";
const H2 = "22222222-2222-4222-8222-222222222222";

const seed = () => ({
  holdings: [
    { id: H1, user_id: USER, name: "DBS", ticker: "D05.SI", market: "SGX", qty: 10, avg_cost: 30, last_price: 35, sector: "" },
    { id: H2, user_id: USER, name: "Apple", ticker: "AAPL", market: "US", qty: 5, avg_cost: 100, last_price: 120, sector: "" },
  ],
  holding_dividends: [{ id: "d1", holding_id: H1 }],
});

const holding = (o: Partial<Holding>): Holding =>
  ({ name: "DBS", ticker: "D05.SI", market: "SGX", qty: 10, avgCost: 30, lastPrice: 35, sector: "", ...o }) as Holding;

describe("saveHoldings", () => {
  it("does not delete holdings that are missing from the payload", async () => {
    const f = createFakeSupabase(seed());
    await saveHoldings(f.client, USER, [holding({ id: H1 })]);
    expect(f.deletes()).toHaveLength(0);
    expect(f.table("holdings")).toHaveLength(2);
  });

  it("keeps the same row (and its dividends) when the ticker is edited", async () => {
    const f = createFakeSupabase(seed());
    await saveHoldings(f.client, USER, [holding({ id: H1, ticker: "D05" }), holding({ id: H2, ticker: "AAPL", name: "Apple" })]);
    expect(f.deletes()).toHaveLength(0);
    const row = f.table("holdings").find((r) => r.id === H1)!;
    expect(row.ticker).toBe("D05");
    expect(f.table("holding_dividends")).toHaveLength(1);
  });

  it("inserts holdings without a persisted id", async () => {
    const f = createFakeSupabase(seed());
    await saveHoldings(f.client, USER, [holding({ id: "new-0", ticker: "NEW" })]);
    expect(f.table("holdings")).toHaveLength(3);
  });

  it("deletes only explicitly removed ids", async () => {
    const f = createFakeSupabase(seed());
    await saveHoldings(f.client, USER, [holding({ id: H1 })], [H2]);
    expect(f.table("holdings").map((r) => r.id)).toEqual([H1]);
  });

  it("errors instead of recreating a row whose id no longer exists", async () => {
    const f = createFakeSupabase(seed());
    await expect(
      saveHoldings(f.client, USER, [holding({ id: "33333333-3333-4333-8333-333333333333" })])
    ).rejects.toMatchObject({ status: 409 });
    expect(f.table("holdings")).toHaveLength(2);
  });

  it("surfaces update errors instead of ignoring them", async () => {
    const f = createFakeSupabase(seed(), {
      failOn: (op) => (op.kind === "update" ? "boom" : null),
    });
    await expect(saveHoldings(f.client, USER, [holding({ id: H1 })])).rejects.toThrow("boom");
  });
});
