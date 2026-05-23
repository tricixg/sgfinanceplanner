/** Personal cash jar (user_savings_accounts). */
export type UserSavingsAccount = {
  id: string;
  userId: string;
  name: string;
  balance: number;
  notes: string;
  sortOrder: number;
};

/** Joint cash pool (savings_pools) for a household. */
export type SavingsPool = {
  id: string;
  householdId: string;
  name: string;
  balance: number;
  notes: string;
  sortOrder: number;
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
  targetDate: string | null;
  monthlyContribution: number;
  whereLabel: string;
  linkedAccountId: string | null;
  linkedPoolId: string | null;
  sortOrder: number;
};

export type SavingsSnapshot = {
  personalCash: number;
  jointCash: number;
  personalMonthlySave: number;
  jointMonthlySave: number;
};

export type SavingsBundle = {
  accounts: UserSavingsAccount[];
  pools: SavingsPool[];
  goals: SavingsGoal[];
  totals: SavingsSnapshot;
  householdId: string | null;
  paired: boolean;
};

export type HouseholdMember = {
  userId: string;
  role: string;
  email: string | null;
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
  spentAt: string;
  note: string;
  createdAt: string;
};
