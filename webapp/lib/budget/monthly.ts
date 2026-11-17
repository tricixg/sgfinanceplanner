import type { BudgetItem } from "@/lib/types";
import type { BudgetLineRow } from "@/lib/expenses/budget-match";

/** Keys are `YYYY-MM`; only months the user has saved. */
export type BudgetMonthMap = Record<string, BudgetItem[]>;

export type ResolvedBudgetMonth = {
  lines: BudgetItem[];
  sourceYm: string | null;
  isOwn: boolean;
};

export type BudgetMonthStatus = "past" | "current" | "next" | "future";

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isYm(value: unknown): value is string {
  return typeof value === "string" && YM_RE.test(value);
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Latest configured month on or before `ym`; else the earliest configured month; else empty. */
export function resolveBudgetMonth(
  months: BudgetMonthMap | undefined | null,
  ym: string
): ResolvedBudgetMonth {
  const keys = Object.keys(months ?? {}).sort();
  if (!months || keys.length === 0) return { lines: [], sourceYm: null, isOwn: false };
  let sourceYm = keys[0];
  for (const k of keys) {
    if (k <= ym) sourceYm = k;
    else break;
  }
  return { lines: months[sourceYm] ?? [], sourceYm, isOwn: sourceYm === ym };
}

export function isBudgetMonthEditable(ym: string, currentYm: string): boolean {
  return ym === currentYm || ym === addMonths(currentYm, 1);
}

export function budgetMonthStatus(ym: string, currentYm: string): BudgetMonthStatus {
  if (ym < currentYm) return "past";
  if (ym === currentYm) return "current";
  if (ym === addMonths(currentYm, 1)) return "next";
  return "future";
}

/**
 * Rows for bucketing spend in month `ym`: the month's resolved lines in snapshot
 * order, then every other non-`save` catalog row at 0 flagged `inactive`.
 */
export function budgetLineRowsForMonth(
  catalog: BudgetLineRow[],
  months: BudgetMonthMap,
  ym: string
): BudgetLineRow[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const { lines } = resolveBudgetMonth(months, ym);
  const used = new Set<string>();
  const rows: BudgetLineRow[] = [];
  lines.forEach((l, i) => {
    if (!l.id) return;
    const cat = byId.get(l.id);
    if (!cat || cat.lineType === "save") return;
    used.add(l.id);
    rows.push({
      id: l.id,
      category: cat.category,
      amount: l.amt,
      lineType: cat.lineType,
      sortOrder: i,
    });
  });
  for (const c of catalog) {
    if (used.has(c.id) || c.lineType === "save") continue;
    rows.push({ ...c, amount: 0, inactive: true });
  }
  return rows;
}
