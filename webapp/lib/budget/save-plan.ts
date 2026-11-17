import type { BudgetItem } from "@/lib/types";
import type { BudgetLineRow } from "@/lib/expenses/budget-match";
import { normalizeBudgetItem, stripSaveBudgetLines } from "@/lib/finance/budget";
import { resolveBudgetMonth, type BudgetMonthMap } from "./monthly";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type PlannedBudgetLine = {
  matchId: string | null;
  category: string;
  lineType: BudgetItem["type"];
  amount: number;
  sortOrder: number;
};

export type BudgetSavePlan = {
  lines: PlannedBudgetLine[];
  removedIds: string[];
};

const round2 = (x: number) => Math.round(x * 100) / 100;

export function planBudgetMonthSave(args: {
  ym: string;
  incoming: Partial<BudgetItem>[];
  catalog: BudgetLineRow[];
  months: BudgetMonthMap;
  floors: Map<string, number>;
}): BudgetSavePlan {
  const { ym, incoming, catalog, months, floors } = args;
  const items = stripSaveBudgetLines(incoming.map((b) => normalizeBudgetItem(b)));
  const used = new Set<string>();
  const lines: PlannedBudgetLine[] = [];

  items.forEach((b, i) => {
    const matchById =
      b.id && UUID_RE.test(b.id)
        ? catalog.find((c) => c.id === b.id && !used.has(c.id))
        : undefined;
    const match =
      matchById ??
      catalog.find((c) => c.category === b.cat && c.lineType === b.type && !used.has(c.id));
    if (match) used.add(match.id);
    const clean = Number.isFinite(b.amt) && b.amt > 0 ? round2(b.amt) : 0;
    lines.push({
      matchId: match?.id ?? null,
      category: b.cat.slice(0, 120),
      lineType: b.type,
      amount: Math.max(clean, match ? (floors.get(match.id) ?? 0) : 0),
      sortOrder: i,
    });
  });

  const removedIds = resolveBudgetMonth(months, ym)
    .lines.map((l) => l.id)
    .filter((id): id is string => !!id && !used.has(id));
  return { lines, removedIds };
}

export function classifyRemovedLines(args: {
  removedIds: string[];
  monthsAfter: BudgetMonthMap;
  currentYm: string;
}): { hardDelete: string[]; unlinkRecurring: string[] } {
  const { removedIds, monthsAfter, currentYm } = args;
  const inAny = new Set<string>();
  for (const lines of Object.values(monthsAfter)) {
    for (const l of lines) if (l.id) inAny.add(l.id);
  }
  const [y, m] = currentYm.split("-").map(Number);
  const t = y * 12 + m; // next month
  const nextYm = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  const live = new Set<string>();
  for (const ym of [currentYm, nextYm]) {
    for (const l of resolveBudgetMonth(monthsAfter, ym).lines) if (l.id) live.add(l.id);
  }
  const hardDelete: string[] = [];
  const unlinkRecurring: string[] = [];
  for (const id of removedIds) {
    if (!inAny.has(id)) hardDelete.push(id);
    else if (!live.has(id)) unlinkRecurring.push(id);
  }
  return { hardDelete, unlinkRecurring };
}
