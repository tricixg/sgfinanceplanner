import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncCashFinancialAccounts } from "@/lib/financial-accounts/sync";

type QueryResult = { data: unknown; error: { message: string } | null };

function makeThenable(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "not", "upsert", "insert"] as const) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

function createMockSupabase(handlers: {
  savings: QueryResult;
  existing: QueryResult;
  upsert?: QueryResult;
  insert?: QueryResult;
}) {
  let financialAccountsStep = 0;

  const from = vi.fn((table: string) => {
    if (table === "user_savings_accounts") {
      return makeThenable(handlers.savings);
    }
    if (table === "financial_accounts") {
      financialAccountsStep += 1;
      if (financialAccountsStep === 1) {
        return makeThenable(handlers.existing);
      }
      if (financialAccountsStep === 2) {
        const b = makeThenable(handlers.upsert ?? { data: null, error: null });
        return b;
      }
      return makeThenable(handlers.insert ?? { data: null, error: null });
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return { from, financialAccountsStep: () => financialAccountsStep };
}

describe("syncCashFinancialAccounts", () => {
  it("uses batched lookup and separate upsert/insert (not per-row loops)", async () => {
    const savingsRows = [
      { id: "sa-1", name: "DBS", sort_order: 0 },
      { id: "sa-2", name: "OCBC", sort_order: 1 },
    ];
    const existingRows = [{ id: "fa-1", savings_account_id: "sa-1" }];

    const mock = createMockSupabase({
      savings: { data: savingsRows, error: null },
      existing: { data: existingRows, error: null },
    });

    await syncCashFinancialAccounts({ from: mock.from } as unknown as SupabaseClient, "user-1");

    expect(mock.from).toHaveBeenCalledTimes(4);
    expect(mock.from.mock.calls.map((c) => c[0])).toEqual([
      "user_savings_accounts",
      "financial_accounts",
      "financial_accounts",
      "financial_accounts",
    ]);
  });

  it("skips financial_accounts writes when there are no savings rows", async () => {
    const mock = createMockSupabase({
      savings: { data: [], error: null },
      existing: { data: [], error: null },
    });

    await syncCashFinancialAccounts({ from: mock.from } as unknown as SupabaseClient, "user-1");

    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(mock.from).toHaveBeenCalledWith("user_savings_accounts");
  });
});
