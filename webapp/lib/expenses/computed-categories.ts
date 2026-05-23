import type { Expense } from "@/lib/savings/types";
import {
  AUTO_DEBT_ID,
  AUTO_ILP_ID,
  AUTO_INSURANCE_ID,
  AUTO_SUBSCRIPTION_ID,
  type AutoCategory,
} from "@/lib/expenses/auto-category-ids";
import {
  COMPUTED_DEBT_LABEL,
  COMPUTED_ILP_LABEL,
  COMPUTED_INSURANCE_LABEL,
  COMPUTED_SUBSCRIPTION_LABEL,
} from "@/lib/finance/budget";
import type { BudgetImportRow, CategoryBudgetSummary } from "@/lib/expenses/budget-summary";

export type ComputedAllocations = {
  debt: number;
  insurance: number;
  ilp: number;
  subscription: number;
};

const COMPUTED_META: Record<AutoCategory, { id: string; label: string }> = {
  debt: { id: AUTO_DEBT_ID, label: COMPUTED_DEBT_LABEL },
  insurance: { id: AUTO_INSURANCE_ID, label: COMPUTED_INSURANCE_LABEL },
  ilp: { id: AUTO_ILP_ID, label: COMPUTED_ILP_LABEL },
  subscription: { id: AUTO_SUBSCRIPTION_ID, label: COMPUTED_SUBSCRIPTION_LABEL },
};

export function buildComputedCategories(
  expenses: Expense[],
  allocations: ComputedAllocations
): CategoryBudgetSummary[] {
  const kinds: AutoCategory[] = ["debt", "insurance", "ilp", "subscription"];

  return kinds.map((kind) => {
    const meta = COMPUTED_META[kind];
    const allocated = allocations[kind];
    const matched = expenses.filter((e) => e.autoCategory === kind);
    const spent = matched.reduce((s, e) => s + e.amount, 0);
    return {
      budgetLineId: meta.id,
      category: meta.label,
      lineType: "auto",
      autoCategory: kind,
      allocated,
      spent,
      remaining: allocated - spent,
      expenses: matched,
      imports: [] as BudgetImportRow[],
    };
  });
}
