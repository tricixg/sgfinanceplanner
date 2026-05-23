"use client";

import { createContext } from "react";
import type { DashboardState } from "@/lib/types";
import type {
  AccountsBundle,
  HouseholdMember,
  PartnerInvite,
  SavingsBundle,
  SavingsGoal,
  SavingsPool,
  UserSavingsAccount,
} from "@/lib/savings/types";
import type { FinancialAccount } from "@/lib/transactions/types";

export type AppDataContextValue = {
  state: DashboardState;
  setState: (
    updater: DashboardState | ((prev: DashboardState) => DashboardState)
  ) => void;
  loading: boolean;
  configured: boolean;
  reload: () => Promise<void>;
  saveLoans: (next: DashboardState["loans"]) => Promise<void>;
  saveBudget: (next: DashboardState["budget"]) => Promise<void>;
  saveCards: (next: DashboardState["creditCards"]) => Promise<void>;
  saveHoldings: (next: DashboardState["holdings"]) => Promise<void>;
  cardsApi:
    | { cards: DashboardState["creditCards"]; saveCards: AppDataContextValue["saveCards"]; configured: true }
    | undefined;
};

export type SavingsContextValue = {
  bundle: SavingsBundle;
  loading: boolean;
  configured: boolean;
  error: string;
  reload: () => Promise<void>;
  savePools: (pools: SavingsPool[]) => Promise<void>;
  saveGoals: (goals: SavingsGoal[]) => Promise<void>;
  recordGoalDeposit: (
    goalId: string,
    payload: {
      amount: number;
      occurredAt?: string;
      note?: string;
      kind?: "deposit" | "withdrawal" | "adjustment";
    }
  ) => Promise<void>;
  recordPoolTransaction: (
    poolId: string,
    payload: {
      amount: number;
      occurredAt?: string;
      kind?: "deposit" | "withdrawal" | "adjustment";
      note?: string;
      goalId?: string;
    }
  ) => Promise<void>;
};

export type AccountsContextValue = {
  accounts: UserSavingsAccount[];
  totals: AccountsBundle["totals"] | null;
  loading: boolean;
  configured: boolean;
  reload: () => Promise<void>;
  saveAccounts: (next: UserSavingsAccount[]) => Promise<void>;
  recordAccountTransaction: (
    accountId: string,
    payload: {
      amount: number;
      occurredAt?: string;
      kind?: "deposit" | "withdrawal" | "adjustment";
      note?: string;
      goalId?: string | null;
    }
  ) => Promise<void>;
};

export type HouseholdContextValue = {
  householdId: string | null;
  paired: boolean;
  members: HouseholdMember[];
  sentInvites: PartnerInvite[];
  receivedInvites: PartnerInvite[];
  loading: boolean;
  configured: boolean;
  reload: () => Promise<void>;
  sendInvite: (email: string) => Promise<void>;
  respondInvite: (id: string, action: "accept" | "decline" | "cancel") => Promise<void>;
  unlinkPartner: () => Promise<void>;
};

export type FinancialAccountsContextValue = {
  accounts: FinancialAccount[];
  loading: boolean;
  configured: boolean;
  reload: () => Promise<void>;
};

export const AppDataContext = createContext<AppDataContextValue | null>(null);
export const SavingsContext = createContext<SavingsContextValue | null>(null);
export const AccountsContext = createContext<AccountsContextValue | null>(null);
export const HouseholdContext = createContext<HouseholdContextValue | null>(null);
export const FinancialAccountsContext = createContext<FinancialAccountsContextValue | null>(
  null
);
