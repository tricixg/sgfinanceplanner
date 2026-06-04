import type { Expense } from "@/lib/savings/types";
import {
  expenseBudgetLines,
  normalizeCategoryKey,
  resolveBudgetLineId,
  type BudgetLineRow,
} from "@/lib/expenses/budget-match";
import {
  buildComputedCategories,
  type ComputedAllocations,
} from "@/lib/expenses/computed-categories";
import type { AutoCategory } from "@/lib/expenses/auto-category-ids";
import {
  netBudgetSpend,
  type ReimbursementTotalsBySource,
} from "@/lib/transactions/reimburse-totals";

/** Standalone budget_transactions (CSV / card ledger), not expense ledger mirrors. */
export type BudgetImportRow = {
  id: string;
  amount: number;
  spentAt: string;
  category: string;
  note: string;
  transactionType: string;
};

export type CategoryBudgetSummary = {
  budgetLineId: string;
  category: string;
  lineType: "fixed" | "spend" | "auto";
  autoCategory?: AutoCategory;
  allocated: number;
  spent: number;
  remaining: number;
  expenses: Expense[];
  imports: BudgetImportRow[];
};

export type UncategorizedSummary = {
  spent: number;
  expenses: Expense[];
  imports: BudgetImportRow[];
};

export type BudgetExpenseSummary = {
  ym: string;
  from: string;
  to: string;
  totals: {
    allocated: number;
    spent: number;
    remaining: number;
  };
  categories: CategoryBudgetSummary[];
  zeroAllocated: CategoryBudgetSummary[];
  computedCategories: CategoryBudgetSummary[];
  uncategorized: UncategorizedSummary;
};

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(last).padStart(2, "0")}`,
  };
}

function importSpentAmount(amount: number, transactionType: string): number {
  if (transactionType === "income") return 0;
  return Math.abs(amount);
}

const EMPTY_REIMBURSEMENTS: ReimbursementTotalsBySource = {
  expense: new Map(),
  budget: new Map(),
};

export function buildBudgetExpenseSummary(
  ym: string,
  budgetLines: BudgetLineRow[],
  expenses: Expense[],
  imports: BudgetImportRow[],
  computedAlloc?: ComputedAllocations,
  reimbursements: ReimbursementTotalsBySource = EMPTY_REIMBURSEMENTS
): BudgetExpenseSummary {
  const { from, to } = monthRange(ym);
  const buckets = expenseBudgetLines(budgetLines);

  const categoryMap = new Map<string, CategoryBudgetSummary>();
  for (const line of buckets) {
    categoryMap.set(line.id, {
      budgetLineId: line.id,
      category: line.category,
      lineType: line.lineType as "fixed" | "spend",
      allocated: line.amount,
      spent: 0,
      remaining: line.amount,
      expenses: [],
      imports: [],
    });
  }

  const uncategorized: UncategorizedSummary = {
    spent: 0,
    expenses: [],
    imports: [],
  };

  for (const exp of expenses) {
    if (exp.autoCategory) continue;
    const lineId = resolveBudgetLineId(buckets, exp.category, exp.budgetLineId);
    if (lineId && categoryMap.has(lineId)) {
      const cat = categoryMap.get(lineId)!;
      const reimbursed = reimbursements.expense.get(exp.id) ?? 0;
      cat.spent += netBudgetSpend(exp.amount, reimbursed);
      cat.expenses.push(exp);
    } else {
      const reimbursed = reimbursements.expense.get(exp.id) ?? 0;
      uncategorized.spent += netBudgetSpend(exp.amount, reimbursed);
      uncategorized.expenses.push(exp);
    }
  }

  for (const imp of imports) {
    const spent = importSpentAmount(imp.amount, imp.transactionType);
    if (spent <= 0) continue;
    const reimbursed = reimbursements.budget.get(imp.id) ?? 0;
    const net = netBudgetSpend(spent, reimbursed);
    if (net <= 0) continue;
    const lineId = resolveBudgetLineId(buckets, imp.category, null);
    if (lineId && categoryMap.has(lineId)) {
      const cat = categoryMap.get(lineId)!;
      cat.spent += net;
      cat.imports.push(imp);
    } else {
      uncategorized.spent += net;
      uncategorized.imports.push(imp);
    }
  }

  const allCategories = [...categoryMap.values()].map((c) => ({
    ...c,
    remaining: c.allocated - c.spent,
  }));

  allCategories.sort((a, b) => {
    const aOrder = buckets.find((l) => l.id === a.budgetLineId)?.sortOrder ?? 0;
    const bOrder = buckets.find((l) => l.id === b.budgetLineId)?.sortOrder ?? 0;
    return aOrder - bOrder;
  });

  const categories = allCategories.filter((c) => c.allocated > 0);
  const zeroAllocated = allCategories.filter((c) => c.allocated <= 0);

  const totals = {
    allocated: categories.reduce((s, c) => s + c.allocated, 0),
    spent:
      allCategories.reduce((s, c) => s + c.spent, 0) + uncategorized.spent,
    remaining: 0,
  };
  totals.remaining = totals.allocated - totals.spent;

  const computedCategories =
    computedAlloc != null
      ? buildComputedCategories(expenses, computedAlloc)
      : [];

  return {
    ym,
    from,
    to,
    totals,
    categories,
    zeroAllocated,
    computedCategories,
    uncategorized,
  };
}

export function partitionBudgetLines<T extends { amt: number }>(
  lines: T[]
): { allocated: T[]; zeroAllocated: T[] } {
  return {
    allocated: lines.filter((l) => l.amt > 0),
    zeroAllocated: lines.filter((l) => l.amt <= 0),
  };
}

/** @deprecated use normalizeCategoryKey from budget-match */
export { normalizeCategoryKey };
