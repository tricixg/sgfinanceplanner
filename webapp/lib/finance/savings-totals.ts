import type { SavingsGoal, SavingsPool, SavingsSnapshot, UserSavingsAccount } from "@/lib/savings/types";

export function sumAccountBalances(accounts: UserSavingsAccount[]): number {
  return accounts.reduce((s, a) => s + a.balance, 0);
}

export function sumPoolBalances(pools: SavingsPool[]): number {
  return pools.reduce((s, p) => s + p.balance, 0);
}

export function sumGoalMonthlyContributions(
  goals: SavingsGoal[],
  scope: "individual" | "shared"
): number {
  return goals
    .filter((g) => g.scope === scope)
    .reduce((s, g) => s + (g.monthlyContribution > 0 ? g.monthlyContribution : 0), 0);
}

export function buildSavingsSnapshot(
  accounts: UserSavingsAccount[],
  pools: SavingsPool[],
  goals: SavingsGoal[]
): SavingsSnapshot {
  return {
    personalCash: sumAccountBalances(accounts),
    jointCash: sumPoolBalances(pools),
    personalMonthlySave: sumGoalMonthlyContributions(goals, "individual"),
    jointMonthlySave: sumGoalMonthlyContributions(goals, "shared"),
  };
}

export function effectiveCash(snapshot: SavingsSnapshot, includeJoint: boolean): number {
  return snapshot.personalCash + (includeJoint ? snapshot.jointCash : 0);
}

export function effectiveMonthlySave(
  snapshot: SavingsSnapshot,
  includeJoint: boolean
): number {
  return (
    snapshot.personalMonthlySave + (includeJoint ? snapshot.jointMonthlySave : 0)
  );
}
