import { describe, expect, it } from "vitest";
import {
  expenseMatchesTransactionType,
  expenseToUnified,
} from "@/lib/expenses/list-for-transactions";
import type { ExpenseForTransaction } from "@/lib/expenses/list-for-transactions";

function sampleExpense(
  overrides: Partial<ExpenseForTransaction> = {}
): ExpenseForTransaction {
  return {
    id: "exp-1",
    userId: "user-1",
    amount: 120,
    category: "Groceries",
    budgetLineId: "bl-1",
    autoCategory: null,
    loanId: null,
    insurancePolicyId: null,
    ilpPolicyId: null,
    subscriptionId: null,
    financialAccountId: "fa-1",
    spentAt: "2025-05-15",
    note: "NTUC",
    createdAt: "2025-05-15T00:00:00Z",
    accountName: "DBS",
    balanceAfter: 880,
    ...overrides,
  };
}

describe("expenseToUnified", () => {
  it("maps manual expense with negative amount", () => {
    const row = expenseToUnified(sampleExpense());
    expect(row.recordType).toBe("expense");
    expect(row.typeLabel).toBe("expense");
    expect(row.amount).toBe(-120);
    expect(row.category).toBe("Groceries");
    expect(row.accountName).toBe("DBS");
    expect(row.balanceAfter).toBe(880);
    expect(row.date).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(row.time).toBe("");
    expect(row.sortAt).toBe("2025-05-15T00:00:00");
  });

  it("maps debt auto payment", () => {
    const row = expenseToUnified(
      sampleExpense({
        autoCategory: "debt",
        category: "Loans & debt",
        note: "Car loan",
      })
    );
    expect(row.typeLabel).toBe("debt");
    expect(row.transactionType).toBe("expense");
  });

  it("maps subscription auto payment", () => {
    const row = expenseToUnified(
      sampleExpense({
        autoCategory: "subscription",
        category: "Subscriptions",
      })
    );
    expect(row.typeLabel).toBe("subscription");
    expect(row.transactionType).toBe("subscription");
  });
});

describe("expenseMatchesTransactionType", () => {
  it("excludes income filter", () => {
    expect(expenseMatchesTransactionType(sampleExpense(), "income")).toBe(false);
  });

  it("matches subscription filter", () => {
    expect(
      expenseMatchesTransactionType(
        sampleExpense({ autoCategory: "subscription" }),
        "subscription"
      )
    ).toBe(true);
    expect(expenseMatchesTransactionType(sampleExpense(), "subscription")).toBe(false);
  });

  it("matches expense filter for manual and non-subscription auto", () => {
    expect(expenseMatchesTransactionType(sampleExpense(), "expense")).toBe(true);
    expect(
      expenseMatchesTransactionType(sampleExpense({ autoCategory: "debt" }), "expense")
    ).toBe(true);
    expect(
      expenseMatchesTransactionType(
        sampleExpense({ autoCategory: "subscription" }),
        "expense"
      )
    ).toBe(false);
  });
});
