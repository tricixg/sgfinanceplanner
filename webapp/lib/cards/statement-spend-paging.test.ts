import { describe, expect, it } from "vitest";
import { createFakeReadSupabase } from "@/lib/test-utils/fake-supabase-reads";
import { buildCardSpendIndexMap } from "./statement-spend-index";
import { sumCardSpendByDay, sumCardSpendInCycle } from "./statement-spend";

// DATA-004: more than PostgREST's 1,000-row cap must still sum correctly.
const USER = "u1";
const ACC = "acc-1";
const OTHER = "acc-2";

function day(i: number): string {
  // 28 days/month avoids invalid dates; spread over Jan–Jun 2026
  const m = 1 + Math.floor(i / 28) % 6;
  const d = 1 + (i % 28);
  return `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function seed() {
  const expenses = Array.from({ length: 2500 }, (_, i) => ({
    id: `e${String(i).padStart(5, "0")}`,
    user_id: USER,
    financial_account_id: ACC,
    amount: 2,
    spent_at: day(i),
  }));
  // a different account that must not leak into ACC's total
  expenses.push({ id: "e-other", user_id: USER, financial_account_id: OTHER, amount: 999, spent_at: "2026-02-02" });
  const budget_transactions = [
    ...Array.from({ length: 1200 }, (_, i) => ({
      id: `b${String(i).padStart(5, "0")}`,
      user_id: USER,
      financial_account_id: ACC,
      expense_id: null,
      amount: 1,
      transaction_type: "expense",
      spent_at: day(i),
    })),
    // anti-spend
    ...Array.from({ length: 300 }, (_, i) => ({
      id: `i${String(i).padStart(5, "0")}`,
      user_id: USER,
      financial_account_id: ACC,
      expense_id: null,
      amount: 1,
      transaction_type: "income",
      spent_at: day(i),
    })),
    // linked to an expense row => already counted via the expense, must be ignored
    { id: "linked", user_id: USER, financial_account_id: ACC, expense_id: "e00000", amount: 777, transaction_type: "expense", spent_at: "2026-01-01" },
  ];
  // 5 of the expense-type budget rows were credited toward a statement => excluded
  const card_statement_credits = Array.from({ length: 5 }, (_, i) => ({
    id: `c${i}`,
    user_id: USER,
    source_record_type: "budget",
    source_record_id: `b${String(i).padStart(5, "0")}`,
  }));
  return { expenses, budget_transactions, card_statement_credits };
}

// 2500*2 + 1200 - 300 - 5 credited
const EXPECTED = 5000 + 1200 - 300 - 5;

describe("card spend loaders page past the 1,000-row cap", () => {
  it("buildCardSpendIndexMap sums every expense and budget row", async () => {
    const f = createFakeReadSupabase(seed());
    const map = await buildCardSpendIndexMap(f.client, USER, [ACC, OTHER], "2026-01-01", "2026-12-31");
    expect(map.get(ACC)!.sumInRange("2026-01-01", "2026-12-31")).toBe(EXPECTED);
    expect(map.get(OTHER)!.sumInRange("2026-01-01", "2026-12-31")).toBe(999);
  });

  it("every paged query uses a deterministic order", async () => {
    const f = createFakeReadSupabase(seed());
    await buildCardSpendIndexMap(f.client, USER, [ACC], "2026-01-01", "2026-12-31");
    const paged = f.queries.filter((q) => q.ranges.length > 0);
    expect(paged.length).toBeGreaterThanOrEqual(3);
    expect(paged.every((q) => q.ordered)).toBe(true);
  });

  it("sumCardSpendByDay sums every row", async () => {
    const f = createFakeReadSupabase(seed());
    const byDay = await sumCardSpendByDay(f.client, USER, ACC, "2026-01-01", "2026-12-31");
    expect(Object.values(byDay).reduce((s, v) => s + v, 0)).toBe(EXPECTED);
  });

  it("sumCardSpendInCycle sums a cycle with more than 1,000 rows", async () => {
    const f = createFakeReadSupabase(seed());
    const total = await sumCardSpendInCycle(f.client, USER, ACC, "2026-01-01", "2026-12-31");
    expect(total).toBe(EXPECTED);
  });
});
