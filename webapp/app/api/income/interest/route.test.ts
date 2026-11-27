import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeReadSupabase } from "@/lib/test-utils/fake-supabase-reads";

const h = vi.hoisted(() => ({
  client: null as unknown,
  categories: [] as { id: string; name: string; slug: string }[],
}));

vi.mock("@/lib/supabase/env", () => ({ isSupabaseAuthConfigured: () => true }));
vi.mock("@/lib/auth/require-user", () => ({
  requireSessionUser: async () => ({ user: { id: "u1" } }),
}));
vi.mock("@/lib/supabase/authed", () => ({
  createAuthedSupabaseClient: async () => h.client,
}));
vi.mock("@/lib/income/load", () => ({ loadIncomeCategories: async () => h.categories }));
vi.mock("@/lib/savings/load-accounts", () => ({
  loadAccountsBundle: async () => ({ accounts: [{ id: "acc-1", name: "UOB One" }] }),
}));

import { GET } from "./route";

const rows = (n: number, categoryId: string) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${categoryId}-${String(i).padStart(5, "0")}`,
    user_id: "u1",
    kind: "deposit",
    income_category_id: categoryId,
    account_id: "acc-1",
    amount: 1,
    occurred_at: `2026-0${1 + (i % 6)}-10T04:00:00.000Z`,
  }));

describe("GET /api/income/interest", () => {
  it("sums only Interest deposits, paging past 1,000 rows", async () => {
    h.categories = [
      { id: "int", name: "Interest", slug: "interest" },
      { id: "sal", name: "Salary", slug: "salary" },
    ];
    h.client = createFakeReadSupabase({
      savings_transactions: [...rows(1200, "int"), ...rows(50, "sal")],
    }).client;

    const res = await GET(
      new NextRequest("http://localhost/api/income/interest?throughYm=2026-06&months=6")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.interest.kpis.total).toBe(1200);
    expect(body.interest.accounts).toEqual([
      { id: "acc-1", label: "UOB One", total: 1200, order: 0 },
    ]);
  });

  it("returns an empty bundle when the Interest category is missing", async () => {
    h.categories = [];
    h.client = createFakeReadSupabase({ savings_transactions: rows(5, "int") }).client;
    const res = await GET(new NextRequest("http://localhost/api/income/interest?months=6"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.interest.months).toHaveLength(6);
    expect(body.interest.kpis.total).toBe(0);
  });

  it("rejects a malformed throughYm", async () => {
    const res = await GET(new NextRequest("http://localhost/api/income/interest?throughYm=bad"));
    expect(res.status).toBe(400);
  });
});
