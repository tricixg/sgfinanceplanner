import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeReadSupabase } from "@/lib/test-utils/fake-supabase-reads";

const h = vi.hoisted(() => ({
  client: null as unknown,
  deposits: [] as unknown[],
}));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseAuthConfigured: () => true }));
vi.mock("@/lib/auth/require-user", () => ({
  requireSessionUser: async () => ({ user: { id: "u1" } }),
}));
vi.mock("@/lib/supabase/authed", () => ({
  createAuthedSupabaseClient: async () => h.client,
}));
vi.mock("@/lib/income/load", () => ({ loadIncomeCategories: async () => [] }));
vi.mock("@/lib/savings/load-accounts", () => ({
  loadAccountsBundle: async () => ({ accounts: [] }),
}));
vi.mock("@/lib/income/analytics", () => ({
  buildIncomeAnalytics: (input: { deposits: unknown[] }) => {
    h.deposits = input.deposits;
    return { months: [] };
  },
}));

import { GET } from "./route";

describe("GET /api/income/analytics (DATA-004)", () => {
  beforeEach(() => {
    h.deposits = [];
  });

  it("passes every deposit in the window to the builder, past 1,000", async () => {
    h.client = createFakeReadSupabase({
      savings_transactions: Array.from({ length: 1600 }, (_, i) => ({
        id: `d${String(i).padStart(5, "0")}`,
        user_id: "u1",
        kind: "deposit",
        income_category_id: "cat-1",
        account_id: "acc-1",
        source_record_id: null,
        amount: 5,
        occurred_at: `2026-0${1 + (i % 6)}-10T04:00:00.000Z`,
      })),
    }).client;

    const res = await GET(
      new NextRequest("http://localhost/api/income/analytics?throughYm=2026-06&months=6")
    );
    expect(res.status).toBe(200);
    expect(h.deposits).toHaveLength(1600);
  });
});
