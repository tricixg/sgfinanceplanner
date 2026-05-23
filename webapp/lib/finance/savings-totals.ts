import type {
  SavingsGoal,
  SavingsPool,
  SavingsSnapshot,
  UserSavingsAccount,
} from "@/lib/savings/types";

export function sumAccountBalances(accounts: UserSavingsAccount[]): number {
  return accounts.reduce((s, a) => s + a.balance, 0);
}

export function sumSavingsAccountBalances(accounts: UserSavingsAccount[]): number {
  return accounts
    .filter((a) => a.includeInSavings)
    .reduce((s, a) => s + a.balance, 0);
}

export function sumPoolBalances(pools: SavingsPool[]): number {
  return pools.reduce((s, p) => s + p.balance, 0);
}

export function sumSavingsPoolBalances(pools: SavingsPool[]): number {
  return pools
    .filter((p) => p.includeInSavings)
    .reduce((s, p) => s + p.balance, 0);
}

export function sumGoalMonthlyContributions(
  goals: SavingsGoal[],
  scope: "individual" | "shared"
): number {
  return goals
    .filter((g) => g.scope === scope)
    .reduce((s, g) => s + (g.monthlyContribution > 0 ? g.monthlyContribution : 0), 0);
}

export function buildAccountTotals(accounts: UserSavingsAccount[]) {
  const personalNetWorthCash = sumAccountBalances(accounts);
  const personalSavingsCash = sumSavingsAccountBalances(accounts);
  return { personalSavingsCash, personalNetWorthCash };
}

export function buildSavingsSnapshot(
  accounts: UserSavingsAccount[],
  pools: SavingsPool[],
  goals: SavingsGoal[]
): SavingsSnapshot {
  const personalNetWorthCash = sumAccountBalances(accounts);
  const personalSavingsCash = sumSavingsAccountBalances(accounts);
  const jointNetWorthCash = sumPoolBalances(pools);
  const jointSavingsCash = sumSavingsPoolBalances(pools);
  return {
    personalSavingsCash,
    personalNetWorthCash,
    personalCash: personalSavingsCash,
    jointCash: jointSavingsCash,
    jointSavingsCash,
    jointNetWorthCash,
    personalMonthlySave: sumGoalMonthlyContributions(goals, "individual"),
    jointMonthlySave: sumGoalMonthlyContributions(goals, "shared"),
  };
}

/** Personal cash accounts included in net worth (all accounts, not savings-flag only). */
export function netWorthPersonalCash(snapshot: SavingsSnapshot): number {
  return snapshot.personalNetWorthCash ?? 0;
}

export function effectiveCash(snapshot: SavingsSnapshot, includeJoint: boolean): number {
  const personal = netWorthPersonalCash(snapshot);
  const joint = snapshot.jointNetWorthCash ?? snapshot.jointCash ?? 0;
  return personal + (includeJoint ? joint : 0);
}

export function effectiveMonthlySave(
  snapshot: SavingsSnapshot,
  includeJoint: boolean
): number {
  return (
    snapshot.personalMonthlySave + (includeJoint ? snapshot.jointMonthlySave : 0)
  );
}
