import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSavingsCategoryFilter } from "@/lib/transactions/category-filter";
import { listAllTransactions } from "@/lib/savings/ledger";
import { EXCLUDED_FROM_BUDGET_LABEL, UNCATEGORIZED_CATEGORY_FILTER } from "@/lib/transactions/types";

function unreachableSupabase(): SupabaseClient {
  return {
    from: vi.fn(() => {
      throw new Error("supabase should not be queried for this branch");
    }),
  } as unknown as SupabaseClient;
}

function incomeCategoriesSupabase(rows: Array<{ id: string; name: string; slug: string }>) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq"] as const) {
    builder[method] = vi.fn(() => builder);
  }
  builder.order = vi.fn(() =>
    Promise.resolve({
      data: rows.map((r) => ({
        id: r.id,
        user_id: "user-1",
        name: r.name,
        slug: r.slug,
        sort_order: 0,
        counts_in_baseline: false,
        counts_as_additive: true,
      })),
      error: null,
    })
  );
  const from = vi.fn(() => builder);
  return { from } as unknown as SupabaseClient;
}

describe("resolveSavingsCategoryFilter", () => {
  it("returns skip:false with no filter fields when category is empty", async () => {
    const result = await resolveSavingsCategoryFilter(unreachableSupabase(), "user-1", undefined);
    expect(result).toEqual({ skip: false });
  });

  it("resolves the uncategorized sentinel to categoryBlank without querying income categories", async () => {
    const result = await resolveSavingsCategoryFilter(
      unreachableSupabase(),
      "user-1",
      UNCATEGORIZED_CATEGORY_FILTER
    );
    expect(result).toEqual({ skip: false, categoryBlank: true });
  });

  it("resolves the excluded-from-budget label to excludeFromBudget without querying income categories", async () => {
    const result = await resolveSavingsCategoryFilter(
      unreachableSupabase(),
      "user-1",
      EXCLUDED_FROM_BUDGET_LABEL
    );
    expect(result).toEqual({ skip: false, excludeFromBudget: true });
  });

  it("resolves a matching income category name to its id", async () => {
    const supabase = incomeCategoriesSupabase([
      { id: "cat-reimb", name: "Reimbursement", slug: "reimbursement" },
      { id: "cat-comms", name: "Communication", slug: "comms" },
    ]);
    const result = await resolveSavingsCategoryFilter(supabase, "user-1", "Reimbursement");
    expect(result).toEqual({ skip: false, incomeCategoryId: "cat-reimb" });
  });

  it("skips the savings source entirely when the category matches no income category", async () => {
    const supabase = incomeCategoriesSupabase([
      { id: "cat-comms", name: "Communication", slug: "comms" },
    ]);
    const result = await resolveSavingsCategoryFilter(supabase, "user-1", "Groceries");
    expect(result).toEqual({ skip: true });
  });
});

type ChainResult = { data: unknown[]; error: null; count: number };

function queryBuilderSupabase(result: ChainResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "is", "eq", "gte", "lt", "order", "range"] as const) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (onFulfilled: (v: ChainResult) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  const from = vi.fn(() => builder);
  return { from: from as unknown as SupabaseClient["from"], builder };
}

describe("listAllTransactions excluded-from-budget query (regression: excluded rows must have no income category)", () => {
  it("requires both income_category_id IS NULL and exclude_from_budget = true, not exclude_from_budget alone", async () => {
    const { from, builder } = queryBuilderSupabase({ data: [], error: null, count: 0 });
    await listAllTransactions({ from } as unknown as SupabaseClient, { excludeFromBudget: true });

    const isCalls = (builder.is as ReturnType<typeof vi.fn>).mock.calls;
    const eqCalls = (builder.eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(isCalls).toContainEqual(["income_category_id", null]);
    expect(eqCalls).toContainEqual(["exclude_from_budget", true]);
  });

  it("filters by categoryBlank as income_category_id IS NULL and exclude_from_budget = false", async () => {
    const { from, builder } = queryBuilderSupabase({ data: [], error: null, count: 0 });
    await listAllTransactions({ from } as unknown as SupabaseClient, { categoryBlank: true });

    const isCalls = (builder.is as ReturnType<typeof vi.fn>).mock.calls;
    const eqCalls = (builder.eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(isCalls).toContainEqual(["income_category_id", null]);
    expect(eqCalls).toContainEqual(["exclude_from_budget", false]);
  });

  it("filters by incomeCategoryId as a direct equality match", async () => {
    const { from, builder } = queryBuilderSupabase({ data: [], error: null, count: 0 });
    await listAllTransactions({ from } as unknown as SupabaseClient, {
      incomeCategoryId: "cat-reimb",
    });

    const eqCalls = (builder.eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(eqCalls).toContainEqual(["income_category_id", "cat-reimb"]);
  });
});
