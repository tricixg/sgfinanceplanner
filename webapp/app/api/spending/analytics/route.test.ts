import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeReadSupabase } from "@/lib/test-utils/fake-supabase-reads";

const h = vi.hoisted(() => ({
  client: null as unknown,
  captured: null as null | { expenses: unknown[]; imports: unknown[] },
}));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseAuthConfigured: () => true }));
vi.mock("@/lib/auth/require-user", () => ({
  requireSessionUser: async () => ({ user: { id: "u1" } }),
}));
vi.mock("@/lib/supabase/authed", () => ({
  createAuthedSupabaseClient: async () => h.client,
}));
vi.mock("@/lib/budget/load", () => ({
  loadBudgetData: async () => ({ catalog: [], months: {} }),
}));
vi.mock("@/lib/budget/monthly", () => ({ budgetLineRowsForMonth: () => [] }));
vi.mock("@/lib/credit-cards/load", () => ({ loadCreditCards: async () => [] }));
vi.mock("@/lib/transactions/reimburse-totals", () => ({
  loadReimbursementTotals: async () => ({ expense: new Map(), budget: new Map() }),
}));
vi.mock("@/lib/spending/analytics", async (orig) => ({
  ...(await orig<typeof import("@/lib/spending/analytics")>()),
  buildSpendingAnalytics: (input: { expenses: unknown[]; imports: unknown[] }) => {
    h.captured = { expenses: input.expenses, imports: input.imports };
    return { months: [] };
  },
}));

import { GET } from "./route";

describe("GET /api/spending/analytics (DATA-004)", () => {
  beforeEach(() => {
    h.captured = null;
  });

  it("passes every expense / import row to the builder, past 1,000", async () => {
    const day = (i: number) => `2026-0${1 + (i % 6)}-${String(1 + (i % 27)).padStart(2, "0")}`;
    h.client = createFakeReadSupabase({
      expenses: Array.from({ length: 2300 }, (_, i) => ({
        id: `e${String(i).padStart(5, "0")}`,
        user_id: "u1",
        amount: 1,
        spent_at: day(i),
        category: "Food",
      })),
      budget_transactions: Array.from({ length: 1400 }, (_, i) => ({
        id: `b${String(i).padStart(5, "0")}`,
        user_id: "u1",
        expense_id: null,
        transaction_type: "expense",
        amount: 1,
        spent_at: day(i),
        category: "Food",
      })),
    }).client;

    const res = await GET(
      new NextRequest("http://localhost/api/spending/analytics?throughYm=2026-06&months=6")
    );
    expect(res.status).toBe(200);
    expect(h.captured!.expenses).toHaveLength(2300);
    expect(h.captured!.imports).toHaveLength(1400);
  });
});
