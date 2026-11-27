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
  /** Income category ids in the user's order, for consistent category colours. */
  categoryOrder: string[];
  /** Income category id → slug, so built-in categories (Salary) get their pinned colour. */
  categorySlugs: Record<string, string>;
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
  sourceRecordId?: string | null;
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
  categories: { id: string; name: string; slug?: string }[];
  accounts: { id: string; name: string }[];
  excludeReimbursements?: boolean;
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
    // A deposit is a reimbursement purely because it's linked to a specific expense/
    // transaction (source_record_id set) — not because of its category.
    if (input.excludeReimbursements && row.sourceRecordId != null) continue;
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
    categoryOrder: input.categories.map((c) => c.id),
    categorySlugs: Object.fromEntries(
      input.categories.filter((c) => c.slug).map((c) => [c.id, c.slug!])
    ),
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

export type InterestMonthlyRow = {
  ym: string;
  total: number;
  byAccount: IncomeAmountRow[];
};

export type InterestAnalyticsBundle = {
  months: string[];
  monthly: InterestMonthlyRow[];
  /**
   * Accounts with any interest in the window, in the user's account-list order.
   * `order` is the account's index in that full list, so a series keeps its
   * colour when the window (and so the set of accounts shown) changes.
   */
  accounts: { id: string; label: string; total: number; order: number }[];
  /** Running total of interest through each month, aligned with `months`. */
  cumulative: number[];
  kpis: {
    total: number;
    avgPerMonth: number;
    topAccount: { id: string; label: string; total: number } | null;
    latestMonth: number;
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Interest earned per month, broken down by cash account, for the Past Cashflow interest chart. */
export function buildInterestAnalytics(input: {
  throughYm: string;
  months: number;
  deposits: LeanDepositRow[];
  accounts: { id: string; name: string }[];
  interestCategoryId: string | null;
}): InterestAnalyticsBundle {
  const window = monthRangeForWindow(input.throughYm, input.months);
  const monthSet = new Set(window.months);
  const accountLabels = new Map(input.accounts.map((a) => [a.id, a.name || "Account"]));
  const byYmAccount = new Map<string, Map<string, { label: string; amount: number }>>();

  if (input.interestCategoryId) {
    for (const row of input.deposits) {
      if (row.incomeCategoryId !== input.interestCategoryId) continue;
      const ym = ymFromOccurredAt(row.occurredAt);
      if (!ym || !monthSet.has(ym)) continue;
      const amount = Number(row.amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const acctId = row.accountId ?? UNASSIGNED_ACCOUNT_ID;
      const label =
        acctId === UNASSIGNED_ACCOUNT_ID ? "Unassigned" : accountLabels.get(acctId) ?? acctId;
      bump(byYmAccount, ym, acctId, label, amount);
    }
  }

  const monthly: InterestMonthlyRow[] = window.months.map((ym) => {
    const byAccount = mapToRows(byYmAccount.get(ym));
    return { ym, total: round2(byAccount.reduce((s, r) => s + r.amount, 0)), byAccount };
  });

  const accountTotals = new Map<string, { label: string; total: number }>();
  for (const m of monthly) {
    for (const a of m.byAccount) {
      const prev = accountTotals.get(a.id) ?? { label: a.label, total: 0 };
      prev.total += a.amount;
      accountTotals.set(a.id, prev);
    }
  }
  const accountOrder = new Map(input.accounts.map((a, i) => [a.id, i]));
  const accounts = [...accountTotals.entries()]
    .map(([id, { label, total }]) => ({
      id,
      label,
      total: round2(total),
      order: accountOrder.get(id) ?? input.accounts.length,
    }))
    .sort((a, b) => a.order - b.order);
  const top = accounts.reduce<(typeof accounts)[number] | null>(
    (best, a) => (best == null || a.total > best.total ? a : best),
    null
  );

  let running = 0;
  const cumulative = monthly.map((m) => {
    running += m.total;
    return round2(running);
  });
  const total = round2(running);

  return {
    months: window.months,
    monthly,
    accounts,
    cumulative,
    kpis: {
      total,
      avgPerMonth: monthly.length ? round2(total / monthly.length) : 0,
      topAccount: top ? { id: top.id, label: top.label, total: top.total } : null,
      latestMonth: monthly[monthly.length - 1]?.total ?? 0,
    },
  };
}
