import type { BudgetItem } from "@/lib/types";

export type BudgetLineRow = {
  id: string;
  category: string;
  amount: number;
  lineType: BudgetItem["type"];
  sortOrder: number;
};

export function normalizeCategoryKey(name: string): string {
  return name.trim().toLowerCase();
}

export function isExpenseBudgetType(type: BudgetItem["type"]): boolean {
  return type === "fixed" || type === "spend";
}

export function expenseBudgetLines(lines: BudgetLineRow[]): BudgetLineRow[] {
  return lines.filter((l) => isExpenseBudgetType(l.lineType));
}

export function resolveBudgetLineId(
  lines: BudgetLineRow[],
  categoryText: string,
  budgetLineId?: string | null
): string | null {
  if (budgetLineId) {
    const byId = lines.find((l) => l.id === budgetLineId);
    if (byId && isExpenseBudgetType(byId.lineType)) return byId.id;
  }
  const key = normalizeCategoryKey(categoryText);
  if (!key) return null;
  const match = lines.find(
    (l) => isExpenseBudgetType(l.lineType) && normalizeCategoryKey(l.category) === key
  );
  return match?.id ?? null;
}

export function mapDbBudgetLine(row: Record<string, unknown>): BudgetLineRow {
  return {
    id: String(row.id),
    category: String(row.category ?? ""),
    amount: Number(row.amount ?? 0),
    lineType: (row.line_type ?? "fixed") as BudgetItem["type"],
    sortOrder: Number(row.sort_order ?? 0),
  };
}
