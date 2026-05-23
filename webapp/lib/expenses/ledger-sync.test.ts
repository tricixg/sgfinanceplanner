import { describe, expect, it } from "vitest";
import {
  expenseBudgetTransactionType,
  expenseLedgerNote,
} from "@/lib/expenses/ledger-sync";
import type { Expense } from "@/lib/savings/types";

function sampleExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-1",
    userId: "user-1",
    amount: 50,
    category: "Insurance",
    budgetLineId: null,
    autoCategory: "insurance",
    loanId: null,
    insurancePolicyId: "pol-1",
    ilpPolicyId: null,
    subscriptionId: null,
    financialAccountId: "fa-1",
    spentAt: "2025-05-01",
    note: "",
    createdAt: "2025-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("expenseLedgerNote", () => {
  it("prefers explicit note", () => {
    expect(expenseLedgerNote(sampleExpense({ note: "May premium" }))).toBe("May premium");
  });

  it("falls back to category", () => {
    expect(expenseLedgerNote(sampleExpense({ note: "" }))).toBe("Insurance");
  });
});

describe("expenseBudgetTransactionType", () => {
  it("uses subscription for subscription auto category", () => {
    expect(
      expenseBudgetTransactionType(sampleExpense({ autoCategory: "subscription" }))
    ).toBe("subscription");
  });

  it("uses expense for other categories", () => {
    expect(expenseBudgetTransactionType(sampleExpense({ autoCategory: "debt" }))).toBe(
      "expense"
    );
    expect(expenseBudgetTransactionType(sampleExpense({ autoCategory: null }))).toBe(
      "expense"
    );
  });
});
