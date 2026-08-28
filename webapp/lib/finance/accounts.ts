import type { DashboardState, Goal, SavingsAccount } from "@/lib/types";
import type { UserSavingsAccount } from "@/lib/savings/types";
import { buildAccountTotals } from "./savings-totals";

export function defaultSavingsAccount(): SavingsAccount {
  return { name: "", balance: 0, notes: "", includeInSavings: true };
}

/** Total cash across all savings accounts (net worth, cashflow, projections). */
export function cashAccountsTotal(S: DashboardState): number {
  return (S.accounts ?? []).reduce((sum, a) => sum + a.balance, 0);
}

type LegacyAccountsSaved = {
  accounts?: Partial<SavingsAccount>[];
  goals?: Goal[];
  cash?: number;
};

function normalizeAccount(raw: Partial<SavingsAccount>): SavingsAccount {
  const base = defaultSavingsAccount();
  return {
    ...base,
    ...raw,
    name: typeof raw.name === "string" ? raw.name : base.name,
    balance: typeof raw.balance === "number" ? raw.balance : 0,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    includeInSavings: raw.includeInSavings !== false,
  };
}

/** Map local JSON accounts for savings-totals helpers. */
export function localAccountsAsUserSavings(S: DashboardState): UserSavingsAccount[] {
  return (S.accounts ?? []).map((a, i) => ({
    id: `local-${i}`,
    userId: "",
    name: a.name,
    balance: a.balance,
    notes: a.notes ?? "",
    sortOrder: i,
    includeInSavings: a.includeInSavings !== false,
    hidden: false,
  }));
}

export function localAccountTotals(S: DashboardState) {
  return buildAccountTotals(localAccountsAsUserSavings(S));
}

export function migrateAccounts(saved: LegacyAccountsSaved): SavingsAccount[] {
  if (saved.accounts?.length) {
    return saved.accounts.map((a) => normalizeAccount(a));
  }

  const goals = saved.goals ?? [];
  if (goals.length) {
    const byWhere = new Map<string, number>();
    for (const g of goals) {
      const key = g.where?.trim() || "Savings";
      byWhere.set(key, (byWhere.get(key) ?? 0) + g.saved);
    }
    const migrated = [...byWhere.entries()]
      .filter(([, balance]) => balance > 0)
      .map(([name, balance]) =>
        normalizeAccount({
          name,
          balance,
          notes: "Migrated from savings goal saved amounts",
        })
      );
    if (migrated.length > 0) {
      console.info("[migrateAccounts] from goals", { count: migrated.length });
      return migrated;
    }
  }

  if ((saved.cash ?? 0) > 0) {
    console.info("[migrateAccounts] from legacy cash field", { cash: saved.cash });
    return [
      normalizeAccount({
        name: "Cash savings",
        balance: saved.cash,
        notes: "Migrated from legacy cash field",
      }),
    ];
  }

  return [];
}
