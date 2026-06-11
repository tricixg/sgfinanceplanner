import { addMonthsYm } from "@/lib/finance/calendar";
import {
  expenseBudgetLines,
  type BudgetLineRow,
} from "@/lib/expenses/budget-match";
import type { ReimbursementTotalsBySource } from "@/lib/transactions/reimburse-totals";
import {
  bucketSpendRows,
  buildCardLabels,
  CASH_CARD_ID,
  type LeanExpenseRow,
  type LeanImportRow,
  type SpendingScope,
} from "./bucket-spend";

export type SpendingAmountRow = {
  id: string;
  label: string;
  amount: number;
};

export type SpendingMonthlyRow = {
  ym: string;
  total: number;
  byCategory: SpendingAmountRow[];
  byCard: SpendingAmountRow[];
};

export type SpendingAccountSeries = {
  accountId: string;
  label: string;
  total: number;
  monthly: SpendingMonthlyRow[];
};

export type SpendingAnalyticsBundle = {
  months: string[];
  scope: SpendingScope;
  monthly: SpendingMonthlyRow[];
  perAccount: SpendingAccountSeries[];
  budgetByCategory: { id: string; label: string; monthlyAllocated: number }[];
  insights: {
    momChangePct: Record<string, number | null>;
    topCategories: { id: string; label: string; total: number; sharePct: number }[];
    budgetVariance: {
      id: string;
      label: string;
      allocated: number;
      spent: number;
      over: number;
    }[];
    momIncreases: {
      id: string;
      label: string;
      delta: number;
      fromYm: string;
      toYm: string;
    }[];
    cardShare: { id: string; label: string; total: number; sharePct: number }[];
  };
};

export const DEFAULT_ANALYTICS_MONTHS = 5;

export function monthRangeForWindow(
  throughYm: string,
  months: number
): { months: string[]; from: string; to: string } {
  const safeMonths = Math.max(1, Math.min(24, Math.floor(months)));
  const list: string[] = [];
  for (let i = safeMonths - 1; i >= 0; i--) {
    list.push(addMonthsYm(throughYm, -i));
  }
  const [y, m] = throughYm.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const to = `${throughYm}-${String(last).padStart(2, "0")}`;
  const from = `${list[0]}-01`;
  return { months: list, from, to };
}

function mapToRows(
  map: Map<string, { label: string; amount: number }> | undefined
): SpendingAmountRow[] {
  if (!map) return [];
  return [...map.entries()]
    .map(([id, { label, amount }]) => ({
      id,
      label,
      amount: Math.round(amount * 100) / 100,
    }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function momPct(current: number, prior: number): number | null {
  if (prior <= 0) return current > 0 ? null : 0;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

function accountLabel(accountId: string, cardLabels: Map<string, string>): string {
  if (accountId === CASH_CARD_ID) return "Cash & other";
  return cardLabels.get(accountId) ?? accountId;
}

function buildPerAccount(
  months: string[],
  byYmCardCategory: Map<
    string,
    Map<string, Map<string, { label: string; amount: number }>>
  >,
  cardLabels: Map<string, string>
): SpendingAccountSeries[] {
  const accountIds = new Set<string>();
  for (const ym of months) {
    const cardMap = byYmCardCategory.get(ym);
    if (!cardMap) continue;
    for (const cardId of cardMap.keys()) accountIds.add(cardId);
  }

  const series: SpendingAccountSeries[] = [];
  for (const accountId of accountIds) {
    const monthly = months.map((ym) => {
      const byCategory = mapToRows(byYmCardCategory.get(ym)?.get(accountId));
      const total = Math.round(byCategory.reduce((s, r) => s + r.amount, 0) * 100) / 100;
      return { ym, total, byCategory, byCard: [] };
    });
    const total = Math.round(monthly.reduce((s, m) => s + m.total, 0) * 100) / 100;
    if (total <= 0) continue;
    series.push({
      accountId,
      label: accountLabel(accountId, cardLabels),
      total,
      monthly,
    });
  }

  return series.sort((a, b) => b.total - a.total);
}

export function buildSpendingAnalytics(input: {
  throughYm: string;
  months?: number;
  scope: SpendingScope;
  budgetLines: BudgetLineRow[];
  expenses: LeanExpenseRow[];
  imports: LeanImportRow[];
  reimbursements: ReimbursementTotalsBySource;
  cards: { financialAccountId: string | null; name: string }[];
}): SpendingAnalyticsBundle {
  const window = monthRangeForWindow(
    input.throughYm,
    input.months ?? DEFAULT_ANALYTICS_MONTHS
  );
  const cardLabels = buildCardLabels(input.cards);

  const { byYmCategory, byYmCard, byYmCardCategory } = bucketSpendRows({
    scope: input.scope,
    budgetLines: input.budgetLines,
    expenses: input.expenses,
    imports: input.imports,
    reimbursements: input.reimbursements,
    cardLabels,
  });

  const monthly: SpendingMonthlyRow[] = window.months.map((ym) => {
    const byCategory = mapToRows(byYmCategory.get(ym));
    const byCard = mapToRows(byYmCard.get(ym));
    const total = Math.round(byCategory.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    return { ym, total, byCategory, byCard };
  });

  const budgetByCategory = expenseBudgetLines(input.budgetLines)
    .filter((l) => l.lineType === "spend" && l.amount > 0)
    .map((l) => ({
      id: l.id,
      label: l.category,
      monthlyAllocated: l.amount,
    }));

  const categoryTotals = new Map<string, { label: string; total: number }>();
  for (const row of monthly) {
    for (const c of row.byCategory) {
      const prev = categoryTotals.get(c.id) ?? { label: c.label, total: 0 };
      prev.total += c.amount;
      categoryTotals.set(c.id, prev);
    }
  }

  const grandTotal = [...categoryTotals.values()].reduce((s, c) => s + c.total, 0);
  const topCategories = [...categoryTotals.entries()]
    .map(([id, { label, total }]) => ({
      id,
      label,
      total: Math.round(total * 100) / 100,
      sharePct: grandTotal > 0 ? Math.round((total / grandTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const momChangePct: Record<string, number | null> = {};
  for (let i = 0; i < monthly.length; i++) {
    const prior = i > 0 ? monthly[i - 1]!.total : 0;
    momChangePct[monthly[i]!.ym] = momPct(monthly[i]!.total, prior);
  }

  const budgetVariance = budgetByCategory
    .map((b) => {
      const spent = categoryTotals.get(b.id)?.total ?? 0;
      const allocated = b.monthlyAllocated * window.months.length;
      const over = Math.round((spent - allocated) * 100) / 100;
      return {
        id: b.id,
        label: b.label,
        allocated,
        spent: Math.round(spent * 100) / 100,
        over,
      };
    })
    .filter((r) => r.spent > 0 || r.allocated > 0)
    .sort((a, b) => b.over - a.over);

  const latest = monthly[monthly.length - 1];
  const prior = monthly.length >= 2 ? monthly[monthly.length - 2] : null;
  const momIncreases: SpendingAnalyticsBundle["insights"]["momIncreases"] = [];

  if (latest && prior) {
    const priorById = new Map(prior.byCategory.map((c) => [c.id, c.amount]));
    for (const c of latest.byCategory) {
      const prevAmt = priorById.get(c.id) ?? 0;
      const delta = Math.round((c.amount - prevAmt) * 100) / 100;
      if (delta > 0) {
        momIncreases.push({
          id: c.id,
          label: c.label,
          delta,
          fromYm: prior.ym,
          toYm: latest.ym,
        });
      }
    }
    momIncreases.sort((a, b) => b.delta - a.delta);
  }

  const latestCardTotal = latest?.byCard.reduce((s, c) => s + c.amount, 0) ?? 0;
  const cardShare = (latest?.byCard ?? [])
    .map((c) => ({
      id: c.id,
      label: c.label,
      total: c.amount,
      sharePct:
        latestCardTotal > 0
          ? Math.round((c.amount / latestCardTotal) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const perAccount = buildPerAccount(window.months, byYmCardCategory, cardLabels);

  return {
    months: window.months,
    scope: input.scope,
    monthly,
    perAccount,
    budgetByCategory,
    insights: {
      momChangePct,
      topCategories: topCategories.slice(0, 10),
      budgetVariance,
      momIncreases: momIncreases.slice(0, 8),
      cardShare,
    },
  };
}
