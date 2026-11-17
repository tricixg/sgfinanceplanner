import { describe, expect, it } from "vitest";
import { createFakeReadSupabase } from "@/lib/test-utils/fake-supabase-reads";
import { loadReimbursementTotals } from "./reimburse-totals";

describe("loadReimbursementTotals paging (DATA-004)", () => {
  it("totals more than 1,000 linked deposits", async () => {
    const f = createFakeReadSupabase({
      savings_transactions: Array.from({ length: 1500 }, (_, i) => ({
        id: `s${String(i).padStart(5, "0")}`,
        user_id: "u1",
        kind: "deposit",
        source_record_type: "expense",
        source_record_id: "exp-1",
        amount: 2,
        occurred_at: "2026-03-01T00:00:00",
      })),
      budget_transactions: Array.from({ length: 1100 }, (_, i) => ({
        id: `b${String(i).padStart(5, "0")}`,
        user_id: "u1",
        transaction_type: "income",
        source_record_type: "budget",
        source_record_id: "bud-1",
        amount: 3,
        spent_at: "2026-03-01",
      })),
    });
    const t = await loadReimbursementTotals(f.client, "u1");
    expect(t.expense.get("exp-1")).toBe(3000);
    expect(t.budget.get("bud-1")).toBe(3300);
  });
});
