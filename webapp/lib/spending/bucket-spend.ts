import {
  expenseBudgetLines,
  normalizeCategoryKey,
  resolveBudgetLineId,
  type BudgetLineRow,
} from "@/lib/expenses/budget-match";
import type { AutoCategory } from "@/lib/expenses/auto-category-ids";
import {
  netBudgetSpend,
  type ReimbursementTotalsBySource,
} from "@/lib/transactions/reimburse-totals";

export const CASH_CARD_ID = "__cash__";
export const UNCATEGORIZED_ID = "__uncategorized__";

export type SpendingScope = "discretionary" | "all";

export type LeanExpenseRow = {
  id: string;
  amount: number;
  spentAt: string;
  category: string;
  budgetLineId?: string | null;
  financialAccountId?: string | null;
  autoCategory?: AutoCategory | null;
};

export type LeanImportRow = {
  id: string;
  amount: number;
  spentAt: string;
  category: string;
  transactionType: string;
  financialAccountId?: string | null;
};

export type SpendBucketKey = {
  ym: string;
  categoryId: string;
  categoryLabel: string;
  cardId: string;
  cardLabel: string;
  amount: number;
};

function ymFromDate(spentAt: string): string | null {
  const ymd = String(spentAt ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return ymd.slice(0, 7);
}

function importGross(amount: number, transactionType: string): number {
  if (transactionType === "income") return 0;
  return Math.abs(amount);
}

function resolveCardId(
  financialAccountId: string | null | undefined,
  cardLabels: Map<string, string>
): { id: string; label: string } {
  const id = financialAccountId?.trim();
  if (id && cardLabels.has(id)) {
    return { id, label: cardLabels.get(id)! };
  }
  return { id: CASH_CARD_ID, label: "Cash & other" };
}

function categoryMeta(
  lineId: string | null,
  categoryText: string,
  categoryLabels: Map<string, string>
): { id: string; label: string } {
  if (lineId && categoryLabels.has(lineId)) {
    return { id: lineId, label: categoryLabels.get(lineId)! };
  }
  if (lineId) {
    const label = categoryText.trim() || "Uncategorized";
    return { id: lineId, label };
  }
  const trimmed = categoryText.trim();
  if (!trimmed) {
    return { id: UNCATEGORIZED_ID, label: "Uncategorized" };
  }
  // Distinct unmatched category names must get distinct buckets — otherwise
  // rows from different categories collapse into one total and whichever
  // row is processed first "wins" the label for the whole combined amount.
  return { id: `${UNCATEGORIZED_ID}:${normalizeCategoryKey(trimmed)}`, label: trimmed };
}

function shouldIncludeRow(
  scope: SpendingScope,
  autoCategory: AutoCategory | null | undefined,
  lineType: string | undefined
): boolean {
  if (scope === "all") return true;
  if (autoCategory) return false;
  if (lineType === "fixed") return false;
  return true;
}

export function buildCategoryLabels(budgetLines: BudgetLineRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of expenseBudgetLines(budgetLines)) {
    map.set(line.id, line.category);
  }
  map.set(UNCATEGORIZED_ID, "Uncategorized");
  return map;
}

export function buildCardLabels(
  cards: { financialAccountId: string | null; name: string }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const card of cards) {
    const id = card.financialAccountId?.trim();
    if (id) map.set(id, card.name);
  }
  return map;
}

/** Bucket expenses + imports into per-month category and card totals. */
export function bucketSpendRows(input: {
  scope: SpendingScope;
  budgetLines: BudgetLineRow[];
  expenses: LeanExpenseRow[];
  imports: LeanImportRow[];
  reimbursements: ReimbursementTotalsBySource;
  cardLabels: Map<string, string>;
}): {
  byYmCategory: Map<string, Map<string, { label: string; amount: number }>>;
  byYmCard: Map<string, Map<string, { label: string; amount: number }>>;
  byYmCardCategory: Map<
    string,
    Map<string, Map<string, { label: string; amount: number }>>
  >;
} {
  const buckets = expenseBudgetLines(input.budgetLines);
  const lineTypeById = new Map(buckets.map((l) => [l.id, l.lineType]));
  const categoryLabels = buildCategoryLabels(input.budgetLines);

  const byYmCategory = new Map<string, Map<string, { label: string; amount: number }>>();
  const byYmCard = new Map<string, Map<string, { label: string; amount: number }>>();
  const byYmCardCategory = new Map<
    string,
    Map<string, Map<string, { label: string; amount: number }>>
  >();

  const add = (
    ym: string,
    category: { id: string; label: string },
    card: { id: string; label: string },
    amount: number
  ) => {
    if (!(amount > 0)) return;
    let catMap = byYmCategory.get(ym);
    if (!catMap) {
      catMap = new Map();
      byYmCategory.set(ym, catMap);
    }
    const catEntry = catMap.get(category.id) ?? { label: category.label, amount: 0 };
    catEntry.amount += amount;
    catMap.set(category.id, catEntry);

    let cardMap = byYmCard.get(ym);
    if (!cardMap) {
      cardMap = new Map();
      byYmCard.set(ym, cardMap);
    }
    const cardEntry = cardMap.get(card.id) ?? { label: card.label, amount: 0 };
    cardEntry.amount += amount;
    cardMap.set(card.id, cardEntry);

    let ymCardMap = byYmCardCategory.get(ym);
    if (!ymCardMap) {
      ymCardMap = new Map();
      byYmCardCategory.set(ym, ymCardMap);
    }
    let cardCatMap = ymCardMap.get(card.id);
    if (!cardCatMap) {
      cardCatMap = new Map();
      ymCardMap.set(card.id, cardCatMap);
    }
    const cardCatEntry =
      cardCatMap.get(category.id) ?? { label: category.label, amount: 0 };
    cardCatEntry.amount += amount;
    cardCatMap.set(category.id, cardCatEntry);
  };

  for (const exp of input.expenses) {
    const ym = ymFromDate(exp.spentAt);
    if (!ym) continue;
    const lineId = resolveBudgetLineId(buckets, exp.category, exp.budgetLineId);
    const lineType = lineId ? lineTypeById.get(lineId) : undefined;
    if (!shouldIncludeRow(input.scope, exp.autoCategory, lineType)) continue;

    const reimbursed = input.reimbursements.expense.get(exp.id) ?? 0;
    const net = netBudgetSpend(exp.amount, reimbursed);
    if (net <= 0) continue;

    const category = categoryMeta(lineId, exp.category, categoryLabels);
    const card = resolveCardId(exp.financialAccountId, input.cardLabels);
    add(ym, category, card, net);
  }

  for (const imp of input.imports) {
    const ym = ymFromDate(imp.spentAt);
    if (!ym) continue;
    const gross = importGross(imp.amount, imp.transactionType);
    if (gross <= 0) continue;

    const lineId = resolveBudgetLineId(buckets, imp.category, null);
    const lineType = lineId ? lineTypeById.get(lineId) : undefined;
    if (!shouldIncludeRow(input.scope, null, lineType)) continue;

    const reimbursed = input.reimbursements.budget.get(imp.id) ?? 0;
    const net = netBudgetSpend(gross, reimbursed);
    if (net <= 0) continue;

    const category = categoryMeta(lineId, imp.category, categoryLabels);
    const card = resolveCardId(imp.financialAccountId, input.cardLabels);
    add(ym, category, card, net);
  }

  return { byYmCategory, byYmCard, byYmCardCategory };
}
