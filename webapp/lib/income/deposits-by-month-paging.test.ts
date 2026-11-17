import { describe, expect, it } from "vitest";
import { createFakeReadSupabase } from "@/lib/test-utils/fake-supabase-reads";
import { loadAdditiveIncomeByYm, loadBaselineActualIncomeByYm } from "./deposits-by-month";

// DATA-004: >1,000 deposits in the window must all be counted.
describe("deposits by month", () => {
  const deposits = Array.from({ length: 1800 }, (_, i) => ({
    id: `d${String(i).padStart(5, "0")}`,
    user_id: "u1",
    kind: "deposit",
    income_category_id: "cat-1",
    source_record_id: i < 100 ? "reimb-link" : null, // first 100 are reimbursements
    amount: 10,
    occurred_at: `2026-0${1 + (i % 3)}-15T09:00:00`,
  }));
  const tables = {
    income_categories: [
      { id: "cat-1", user_id: "u1", counts_as_additive: true, counts_in_baseline: true },
    ],
    savings_transactions: deposits,
  };

  it("baseline total includes all 1,800 rows", async () => {
    const f = createFakeReadSupabase(tables);
    const r = await loadBaselineActualIncomeByYm(f.client, "u1", "2026-01", 3);
    expect(Object.values(r).reduce((s, v) => s + v, 0)).toBe(18000);
  });

  it("additive total includes all rows except the 100 reimbursement-linked ones", async () => {
    const f = createFakeReadSupabase(tables);
    const r = await loadAdditiveIncomeByYm(f.client, "u1", "2026-01", 3);
    expect(Object.values(r).reduce((s, v) => s + v, 0)).toBe(17000);
  });
});
