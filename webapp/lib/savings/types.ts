import type { ExpenseEntrySource } from "@/lib/expenses/entry-source";

/** Personal cash jar (user_savings_accounts) — managed on Cash Accounts tab. */
export type UserSavingsAccount = {
  id: string;
  userId: string;
  name: string;
  balance: number;
  notes: string;
  sortOrder: number;
  /** When false, balance counts toward net worth but not savings-tab totals. */
  includeInSavings: boolean;
};

/** Joint cash pool (savings_pools) for a household. */
export type SavingsPool = {
  id: string;
  householdId: string;
  name: string;
  balance: number;
  notes: string;
  sortOrder: number;
  includeInSavings: boolean;
};

export type SavingsTransactionKind = "deposit" | "withdrawal" | "adjustment";

export type SavingsTransaction = {
  id: string;
  userId: string;
  householdId: string | null;
  accountId: string | null;
  poolId: string | null;
  goalId: string | null;
  /** Resolved from savings_goals when listing history. */
  goalName: string | null;
  /** Resolved when listing across accounts/pools. */
  sourceType?: "account" | "pool" | null;
  sourceName?: string | null;
  kind: SavingsTransactionKind;
  amount: number;
  balanceAfter: number | null;
  note: string;
  occurredAt: string;
  createdAt: string;
  incomeCategoryId: string | null;
  incomeCategoryName: string | null;
  excludeFromBudget: boolean;
};

export type AccountsBundle = {
  accounts: UserSavingsAccount[];
  totals: Pick<SavingsSnapshot, "personalSavingsCash" | "personalNetWorthCash">;
};

export type SavingsGoalScope = "individual" | "shared";

export type SavingsGoal = {
  id: string;
  scope: SavingsGoalScope;
  ownerUserId: string | null;
  householdId: string | null;
  name: string;
  targetAmount: number;
  savedAmount: number;
  startDate: string | null;
  targetDate: string | null;
  monthlyContribution: number;
  /** Per-user monthly amounts for shared goals: { userId: amount }. Both members stored. */
  splits: Record<string, number> | null;
  whereLabel: string;
  linkedAccountId: string | null;
  linkedPoolId: string | null;
  linkedFundId: string | null;
  sortOrder: number;
};

export type SavingsSnapshot = {
  /** Sum of personal accounts with includeInSavings. */
  personalSavingsCash: number;
  /** Sum of all personal account balances (net worth). */
  personalNetWorthCash: number;
  /** @deprecated use personalSavingsCash */
  personalCash: number;
  jointCash: number;
  jointSavingsCash: number;
  jointNetWorthCash: number;
  personalMonthlySave: number;
  jointMonthlySave: number;
  /** Sum of investment fund balances — counts toward net worth alongside cash. */
  personalFundsValue: number;
};

export type SavingsBundle = {
  pools: SavingsPool[];
  goals: SavingsGoal[];
  totals: SavingsSnapshot;
  householdId: string | null;
  paired: boolean;
  /** The current user's ID — used to resolve their split on shared goals. */
  myUserId: string;
  /** All household members, so split columns can label You vs Partner. */
  members: { userId: string }[];
};

export type HouseholdMember = {
  userId: string;
  role: string;
  email: string | null;
  joinedAt?: string;
  isYou?: boolean;
};

export type PartnerInvite = {
  id: string;
  householdId: string;
  inviterId: string;
  inviterEmail: string | null;
  inviteeEmail: string;
  status: string;
  createdAt: string;
};

export type Expense = {
  id: string;
  userId: string;
  amount: number;
  category: string;
  budgetLineId: string | null;
  entrySource: ExpenseEntrySource;
  autoCategory: "debt" | "insurance" | "ilp" | "subscription" | "invest" | null;
  loanId: string | null;
  otherLoanId: string | null;
  insurancePolicyId: string | null;
  ilpPolicyId: string | null;
  subscriptionId: string | null;
  investmentId: string | null;
  fundId: string | null;
  financialAccountId: string | null;
  spentAt: string;
  spentTime?: string | null;
  note: string;
  createdAt: string;
};
