"use client";

import { createContext } from "react";
import type { FinanceProfile } from "@/lib/profile/load";
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
import type { Fund, FundsTotals } from "@/lib/funds/types";
import type { MilesBalance, MilesTotals } from "@/lib/miles/types";

export type AppDataContextValue = {
  state: DashboardState;
  setState: (
    updater: DashboardState | ((prev: DashboardState) => DashboardState)
  ) => void;
  /** Alias for coreLoading — blocks DomainPage until core domains are ready. */
  loading: boolean;
  coreLoading: boolean;
  snapshotsLoading: boolean;
  configured: boolean;
  reload: () => Promise<void>;
  reloadLoans: () => Promise<void>;
  reloadOtherLoans: () => Promise<void>;
  reloadHoldings: () => Promise<void>;
  reloadSnapshots: () => Promise<void>;
  saveProfile: (patch: Partial<FinanceProfile>) => Promise<void>;
  saveProfilePolicies: (patch: {
    insurancePolicies?: DashboardState["insurancePolicies"];
    ilpPolicies?: DashboardState["ilpPolicies"];
  }) => Promise<void>;
  saveLoans: (next: DashboardState["loans"]) => Promise<void>;
  savePrefs: (next: DashboardState["prefs"]) => Promise<void>;
  appendSnapshot: (snap: import("@/lib/types").PortfolioSnapshot) => Promise<void>;
  saveBudget: (next: DashboardState["budget"]) => Promise<void>;
  saveCards: (next: DashboardState["creditCards"]) => Promise<void>;
  saveHoldings: (next: DashboardState["holdings"]) => Promise<void>;
  recordHoldingDividend: (
    holdingId: string,
    payload: { perShare: number; occurredAt?: string; note?: string }
  ) => Promise<void>;
  cardsApi:
    | { cards: DashboardState["creditCards"]; saveCards: AppDataContextValue["saveCards"]; configured: true }
    | undefined;
};

export type SavingsContextValue = {
  bundle: SavingsBundle;
  loading: boolean;
  hasLoaded: boolean;
  configured: boolean;
  error: string;
  reload: (opts?: { silent?: boolean }) => Promise<void>;
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

export type FundsContextValue = {
  funds: Fund[];
  totals: FundsTotals | null;
  loading: boolean;
  configured: boolean;
  reload: () => Promise<void>;
  saveFunds: (next: Fund[]) => Promise<void>;
  recordFundTransaction: (
    fundId: string,
    payload: {
      amount: number;
      occurredAt?: string;
      kind?: "deposit" | "withdrawal" | "payout";
      note?: string;
      goalId?: string | null;
    }
  ) => Promise<void>;
};

export type MilesContextValue = {
  balances: MilesBalance[];
  totals: MilesTotals | null;
  loading: boolean;
  configured: boolean;
  reload: () => Promise<void>;
  saveBalances: (next: MilesBalance[]) => Promise<void>;
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
export const FundsContext = createContext<FundsContextValue | null>(null);
export const MilesContext = createContext<MilesContextValue | null>(null);
export const HouseholdContext = createContext<HouseholdContextValue | null>(null);
export const FinancialAccountsContext = createContext<FinancialAccountsContextValue | null>(
  null
);
