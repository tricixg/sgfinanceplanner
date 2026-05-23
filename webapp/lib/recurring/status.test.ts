import { describe, expect, it } from "vitest";
import { expenseSourceKey, findPaymentForSource } from "@/lib/recurring/status";
import type { Expense } from "@/lib/savings/types";

function expense(partial: Partial<Expense> & Pick<Expense, "id">): Expense {
  return {
    id: partial.id,
    userId: "u1",
    amount: partial.amount ?? 100,
    category: "",
    budgetLineId: null,
    autoCategory: partial.autoCategory ?? null,
    loanId: partial.loanId ?? null,
    insurancePolicyId: partial.insurancePolicyId ?? null,
    ilpPolicyId: partial.ilpPolicyId ?? null,
    subscriptionId: partial.subscriptionId ?? null,
    financialAccountId: partial.financialAccountId ?? null,
    spentAt: partial.spentAt ?? "2025-05-10",
    note: "",
    createdAt: "2025-05-10T00:00:00Z",
  };
}

describe("expenseSourceKey", () => {
  it("keys subscription expenses", () => {
    const key = expenseSourceKey(
      expense({ id: "e1", autoCategory: "subscription", subscriptionId: "sub-1" })
    );
    expect(key).toBe("subscription:sub-1");
  });
});

describe("findPaymentForSource", () => {
  it("finds payment for loan in month", () => {
    const expenses = [
      expense({
        id: "e1",
        autoCategory: "debt",
        loanId: "loan-1",
        spentAt: "2025-05-05",
        financialAccountId: "fa-1",
      }),
    ];
    const names = new Map([["fa-1", "DBS"]]);
    const pay = findPaymentForSource(expenses, "debt", "loan-1", names);
    expect(pay?.expenseId).toBe("e1");
    expect(pay?.accountName).toBe("DBS");
  });
});
