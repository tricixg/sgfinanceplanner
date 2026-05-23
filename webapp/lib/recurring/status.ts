import type { AutoCategory } from "@/lib/expenses/auto-category-ids";
import type { Expense } from "@/lib/savings/types";

export type RecurringPaymentInfo = {
  expenseId: string;
  spentAt: string;
  amount: number;
  financialAccountId: string | null;
  accountName: string | null;
};

export function expenseSourceKey(exp: Expense): string | null {
  if (exp.autoCategory === "debt" && exp.loanId) return `debt:${exp.loanId}`;
  if (exp.autoCategory === "insurance" && exp.insurancePolicyId) {
    return `insurance:${exp.insurancePolicyId}`;
  }
  if (exp.autoCategory === "ilp" && exp.ilpPolicyId) return `ilp:${exp.ilpPolicyId}`;
  if (exp.autoCategory === "subscription" && exp.subscriptionId) {
    return `subscription:${exp.subscriptionId}`;
  }
  return null;
}

export function findPaymentForSource(
  expenses: Expense[],
  kind: AutoCategory,
  sourceId: string,
  accountNames: Map<string, string>
): RecurringPaymentInfo | null {
  const key = `${kind}:${sourceId}`;
  const exp = expenses.find((e) => expenseSourceKey(e) === key);
  if (!exp) return null;
  const faId = exp.financialAccountId;
  return {
    expenseId: exp.id,
    spentAt: exp.spentAt,
    amount: exp.amount,
    financialAccountId: faId,
    accountName: faId ? accountNames.get(faId) ?? null : null,
  };
}

export function isLoanActiveInMonth(endYm: string, ym: string): boolean {
  if (!endYm || endYm.length < 7) return true;
  return endYm >= ym.slice(0, 7);
}
