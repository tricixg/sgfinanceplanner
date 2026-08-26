import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reverseExpenseLedger } from "@/lib/expenses/ledger-sync";
import type { Expense } from "@/lib/savings/types";

function sampleExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-1",
    userId: "user-1",
    amount: 50,
    category: "Debt",
    budgetLineId: null,
    entrySource: "manual",
    autoCategory: "debt",
    loanId: null,
    otherLoanId: "loan-1",
    insurancePolicyId: null,
    ilpPolicyId: null,
    subscriptionId: null,
    investmentId: null,
    fundId: null,
    financialAccountId: null,
    spentAt: "2025-05-01",
    note: "",
    createdAt: "2025-05-01T00:00:00Z",
    ...overrides,
  };
}

function thenable(result: unknown) {
  return {
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
}

function createMockSupabase(opts: {
  savingsRows: Array<{ id: string; account_id: string | null; amount: number }>;
  accountBalances?: Record<string, number>;
}) {
  const savingsRows = [...opts.savingsRows];
  const accounts = new Map(Object.entries(opts.accountBalances ?? {}));
  const deletedSavingsIds: string[] = [];
  const updatedBalances: Record<string, number> = {};
  let budgetDeleteCalled = false;

  const from = vi.fn((table: string) => {
    if (table === "savings_transactions") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => thenable({ data: savingsRows, error: null }),
          }),
        }),
        delete: () => ({
          eq: (_col: string, id: string) => ({
            eq: () => {
              const idx = savingsRows.findIndex((r) => r.id === id);
              if (idx >= 0) {
                deletedSavingsIds.push(id);
                savingsRows.splice(idx, 1);
              }
              return thenable({ error: null });
            },
          }),
        }),
      };
    }
    if (table === "user_savings_accounts") {
      return {
        select: () => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: () =>
              Promise.resolve(
                accounts.has(id)
                  ? { data: { balance: accounts.get(id) }, error: null }
                  : { data: null, error: null }
              ),
          }),
        }),
        update: (patch: { balance: number }) => ({
          eq: (_col: string, id: string) => {
            updatedBalances[id] = patch.balance;
            accounts.set(id, patch.balance);
            return thenable({ error: null });
          },
        }),
      };
    }
    if (table === "budget_transactions") {
      return {
        delete: () => ({
          eq: () => ({
            eq: () => {
              budgetDeleteCalled = true;
              return thenable({ error: null });
            },
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return {
    from,
    remainingSavingsRows: () => savingsRows,
    deletedSavingsIds,
    updatedBalances,
    budgetDeleteCalled: () => budgetDeleteCalled,
  };
}

describe("reverseExpenseLedger", () => {
  it("restores the account balance and deletes the linked savings row", async () => {
    const mock = createMockSupabase({
      savingsRows: [{ id: "tx-1", account_id: "acct-1", amount: -50 }],
      accountBalances: { "acct-1": 100 },
    });

    await reverseExpenseLedger(
      { from: mock.from } as unknown as SupabaseClient,
      "user-1",
      sampleExpense({ financialAccountId: "fa-1" })
    );

    expect(mock.updatedBalances["acct-1"]).toBe(150);
    expect(mock.deletedSavingsIds).toEqual(["tx-1"]);
    expect(mock.remainingSavingsRows()).toEqual([]);
    expect(mock.budgetDeleteCalled()).toBe(true);
  });

  it("deletes the linked savings row even when it has no account (record-only)", async () => {
    const mock = createMockSupabase({
      savingsRows: [{ id: "tx-2", account_id: null, amount: -50 }],
    });

    await reverseExpenseLedger(
      { from: mock.from } as unknown as SupabaseClient,
      "user-1",
      sampleExpense({ financialAccountId: null })
    );

    expect(mock.deletedSavingsIds).toEqual(["tx-2"]);
    expect(mock.remainingSavingsRows()).toEqual([]);
    expect(mock.updatedBalances).toEqual({});
  });
});
