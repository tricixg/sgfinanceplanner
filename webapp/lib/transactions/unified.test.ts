import { describe, expect, it } from "vitest";
import { expenseToUnified } from "@/lib/expenses/list-for-transactions";
import { compareSgtSortAtDescending } from "@/lib/time/sgt";
import {
  budgetToUnified,
  savingsToUnified,
  unifiedListHasFilters,
} from "@/lib/transactions/unified";
import type { BudgetTransaction } from "@/lib/transactions/types";
import type { SavingsTransaction } from "@/lib/savings/types";

describe("unified transaction merge (unit sort)", () => {
  it("sorts savings, budget, and expense streams newest first", () => {
    const savings: SavingsTransaction = {
      id: "s1",
      userId: "u1",
      householdId: null,
      accountId: "a1",
      poolId: null,
      goalId: null,
      goalName: null,
      kind: "deposit",
      amount: 100,
      balanceAfter: 100,
      note: "",
      occurredAt: "2025-05-10T08:00:00Z",
      createdAt: "2025-05-10T08:00:00Z",
    };

    const budget: BudgetTransaction = {
      id: "b1",
      userId: "u1",
      financialAccountId: null,
      accountName: "Card",
      ledger: "",
      category: "Food",
      subcategory: "",
      currency: "SGD",
      amount: 20,
      recorder: "",
      spentAt: "2025-05-12",
      spentTime: null,
      tag: "",
      note: "",
      transactionType: "expense",
      importBatchId: null,
      createdAt: "2025-05-12T00:00:00Z",
    };

    const expense = expenseToUnified({
      id: "e1",
      userId: "u1",
      amount: 30,
      category: "Debt",
      budgetLineId: null,
      autoCategory: "debt",
      loanId: "l1",
      insurancePolicyId: null,
      ilpPolicyId: null,
      subscriptionId: null,
      investmentId: null,
      fundId: null,
      financialAccountId: "fa1",
      spentAt: "2025-05-14",
      note: "",
      createdAt: "2025-05-14T00:00:00Z",
      accountName: "DBS",
      balanceAfter: 970,
    });

    const merged = [
      savingsToUnified(savings),
      budgetToUnified(budget),
      expense,
    ].sort((a, b) => compareSgtSortAtDescending(a.sortAt, b.sortAt));

    expect(merged.map((r) => r.id)).toEqual(["e1", "b1", "s1"]);
    expect(merged[0].recordType).toBe("expense");
  });

  it("uses distinct record types so expense-linked savings would not duplicate id keys", () => {
    const expense = expenseToUnified({
      id: "same-id",
      userId: "u1",
      amount: 10,
      category: "Test",
      budgetLineId: null,
      autoCategory: null,
      loanId: null,
      insurancePolicyId: null,
      ilpPolicyId: null,
      subscriptionId: null,
      investmentId: null,
      fundId: null,
      financialAccountId: null,
      spentAt: "2025-05-01",
      note: "",
      createdAt: "2025-05-01T00:00:00Z",
      accountName: null,
      balanceAfter: null,
    });

    expect(expense.recordType).toBe("expense");
    expect(`${expense.recordType}-${expense.id}`).toBe("expense-same-id");
  });
});

describe("unifiedListHasFilters", () => {
  it("is false with default list opts", () => {
    expect(unifiedListHasFilters({})).toBe(false);
    expect(unifiedListHasFilters({ source: "all" })).toBe(false);
  });

  it("is true when any filter is set", () => {
    expect(unifiedListHasFilters({ dateFrom: "2026-05-01" })).toBe(true);
    expect(unifiedListHasFilters({ transactionType: "expense" })).toBe(true);
    expect(unifiedListHasFilters({ source: "savings" })).toBe(true);
  });
});
