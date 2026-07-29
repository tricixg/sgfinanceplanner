import { monthRangeForWindow } from "@/lib/spending/analytics";

export type IncomeAmountRow = {
  id: string;
  label: string;
  amount: number;
};

export type IncomeMonthlyRow = {
  ym: string;
  total: number;
  byCategory: IncomeAmountRow[];
  byAccount: IncomeAmountRow[];
};

export type IncomeAccountSeries = {
  accountId: string;
  label: string;
  total: number;
  monthly: IncomeMonthlyRow[];
};

export type IncomeAnalyticsBundle = {
  months: string[];
  monthly: IncomeMonthlyRow[];
  perAccount: IncomeAccountSeries[];
  insights: {
    momChangePct: Record<string, number | null>;
    topCategories: { id: string; label: string; total: number; sharePct: number }[];
    momIncreases: {
      id: string;
      label: string;
      delta: number;
      fromYm: string;
      toYm: string;
    }[];
    accountShare: { id: string; label: string; total: number; sharePct: number }[];
  };
};

export const DEFAULT_INCOME_ANALYTICS_MONTHS = 5;

export type LeanDepositRow = {
  amount: number;
  occurredAt: string;
  incomeCategoryId?: string | null;
  accountId?: string | null;
};

const UNCATEGORIZED_ID = "__uncategorized__";
const UNASSIGNED_ACCOUNT_ID = "__unassigned__";

function ymFromOccurredAt(occurredAt: string): string | null {
  const s = String(occurredAt ?? "");
  if (s.length < 7) return null;
  return s.slice(0, 7);
}

function mapToRows(
  map: Map<string, { label: string; amount: number }> | undefined
): IncomeAmountRow[] {
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

function bump(
  map: Map<string, Map<string, { label: string; amount: number }>>,
  ym: string,
  id: string,
  label: string,
  amount: number
): void {
  const byId = map.get(ym) ?? new Map<string, { label: string; amount: number }>();
  const prev = byId.get(id) ?? { label, amount: 0 };
  prev.amount += amount;
  byId.set(id, prev);
  map.set(ym, byId);
}

function buildPerAccount(
  months: string[],
  byYmAccountCategory: Map<
    string,
    Map<string, Map<string, { label: string; amount: number }>>
  >,
  accountLabels: Map<string, string>
): IncomeAccountSeries[] {
  const accountIds = new Set<string>();
  for (const ym of months) {
    const acctMap = byYmAccountCategory.get(ym);
    if (!acctMap) continue;
    for (const accountId of acctMap.keys()) accountIds.add(accountId);
  }

  const series: IncomeAccountSeries[] = [];
  for (const accountId of accountIds) {
    const monthly = months.map((ym) => {
      const byCategory = mapToRows(byYmAccountCategory.get(ym)?.get(accountId));
      const total = Math.round(byCategory.reduce((s, r) => s + r.amount, 0) * 100) / 100;
      return { ym, total, byCategory, byAccount: [] };
    });
    const total = Math.round(monthly.reduce((s, m) => s + m.total, 0) * 100) / 100;
    if (total <= 0) continue;
    series.push({
      accountId,
      label:
        accountId === UNASSIGNED_ACCOUNT_ID
          ? "Unassigned"
          : accountLabels.get(accountId) ?? accountId,
      total,
      monthly,
    });
  }

  return series.sort((a, b) => b.total - a.total);
}

export function buildIncomeAnalytics(input: {
  throughYm: string;
  months?: number;
  deposits: LeanDepositRow[];
  categories: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
}): IncomeAnalyticsBundle {
  const window = monthRangeForWindow(
    input.throughYm,
    input.months ?? DEFAULT_INCOME_ANALYTICS_MONTHS
  );
  const monthSet = new Set(window.months);

  const categoryLabels = new Map(input.categories.map((c) => [c.id, c.name || "Income"]));
  const accountLabels = new Map(input.accounts.map((a) => [a.id, a.name || "Account"]));

  const byYmCategory = new Map<string, Map<string, { label: string; amount: number }>>();
  const byYmAccount = new Map<string, Map<string, { label: string; amount: number }>>();
  const byYmAccountCategory = new Map<
    string,
    Map<string, Map<string, { label: string; amount: number }>>
  >();

  for (const row of input.deposits) {
    const ym = ymFromOccurredAt(row.occurredAt);
    if (!ym || !monthSet.has(ym)) continue;
    const amount = Number(row.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const catId = row.incomeCategoryId ?? UNCATEGORIZED_ID;
    const catLabel = categoryLabels.get(catId) ?? "Uncategorized";
    const acctId = row.accountId ?? UNASSIGNED_ACCOUNT_ID;
    const acctLabel =
      acctId === UNASSIGNED_ACCOUNT_ID ? "Unassigned" : accountLabels.get(acctId) ?? acctId;

    bump(byYmCategory, ym, catId, catLabel, amount);
    bump(byYmAccount, ym, acctId, acctLabel, amount);

    const acctMap =
      byYmAccountCategory.get(ym) ?? new Map<string, Map<string, { label: string; amount: number }>>();
    const catMap = acctMap.get(acctId) ?? new Map<string, { label: string; amount: number }>();
    const prev = catMap.get(catId) ?? { label: catLabel, amount: 0 };
    prev.amount += amount;
    catMap.set(catId, prev);
    acctMap.set(acctId, catMap);
    byYmAccountCategory.set(ym, acctMap);
  }

  const monthly: IncomeMonthlyRow[] = window.months.map((ym) => {
    const byCategory = mapToRows(byYmCategory.get(ym));
    const byAccount = mapToRows(byYmAccount.get(ym));
    const total = Math.round(byCategory.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    return { ym, total, byCategory, byAccount };
  });

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

  const latest = monthly[monthly.length - 1];
  const prior = monthly.length >= 2 ? monthly[monthly.length - 2] : null;
  const momIncreases: IncomeAnalyticsBundle["insights"]["momIncreases"] = [];

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

  const latestAccountTotal = latest?.byAccount.reduce((s, a) => s + a.amount, 0) ?? 0;
  const accountShare = (latest?.byAccount ?? [])
    .map((a) => ({
      id: a.id,
      label: a.label,
      total: a.amount,
      sharePct:
        latestAccountTotal > 0
          ? Math.round((a.amount / latestAccountTotal) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const perAccount = buildPerAccount(window.months, byYmAccountCategory, accountLabels);

  return {
    months: window.months,
    monthly,
    perAccount,
    insights: {
      momChangePct,
      topCategories: topCategories.slice(0, 10),
      momIncreases: momIncreases.slice(0, 8),
      accountShare,
    },
  };
}
