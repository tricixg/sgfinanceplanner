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
import type { BenefitInput, BenefitUsage } from "@/lib/benefits/types";
import type { CardStatementComputed } from "@/lib/cards/types";

export type AppDataContextValue = {
  state: DashboardState;
  setState: (
    updater: DashboardState | ((prev: DashboardState) => DashboardState)
  ) => void;
  /** True until the core domains THIS route needs have finished loading (what DomainPage waits for). */
  loading: boolean;
  /** True until EVERY core domain has finished loading — the strict gate for the net-worth snapshot. */
  coreLoading: boolean;
  /** Load state per data domain; a domain is only fetched once something asks for it. */
  domainStatus: Record<import("@/lib/app/domains").DataDomain, import("@/lib/app/domains").DomainStatus>;
  /** Ask for domains (idempotent). Routes get theirs automatically; reading a field also asks. */
  ensureDomains: (domains: readonly import("@/lib/app/domains").DataDomain[]) => void;
  snapshotsLoading: boolean;
  configured: boolean;
  /** Domains that failed to load. Editing them is blocked so an empty list can't overwrite real data. */
  loadErrors: import("@/lib/sync/explicit-delete").LoadErrors;
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
  netWorthHistory: import("@/lib/types").NetWorthSnapshot[];
  reloadNetWorthHistory: () => Promise<void>;
  appendNetWorthSnapshot: (snap: import("@/lib/types").NetWorthSnapshot) => Promise<void>;
  cpfContributions: import("@/lib/cpf/types").CpfContribution[];
  reloadCpfContributions: () => Promise<void>;
  addCpfContribution: (input: {
    month: string;
    oa: number;
    sa: number;
    ma: number;
    note?: string;
    creditedOn?: string | null;
  }) => Promise<void>;
  deleteCpfContribution: (id: string) => Promise<void>;
  updateCpfContribution: (
    id: string,
    input: import("@/lib/cpf/contributions").AddCpfContributionInput
  ) => Promise<void>;
  /** Logged CPF OA withdrawals/credits and cash-paid BTO bills, newest first. */
  cpfTransactions: import("@/lib/cpf/types").CpfTransaction[];
  reloadCpfTransactions: () => Promise<void>;
  addCpfTransaction: (input: import("@/lib/cpf/transactions").AddCpfTransactionInput) => Promise<void>;
  deleteCpfTransaction: (id: string) => Promise<void>;
  updateCpfTransaction: (
    id: string,
    input: import("@/lib/cpf/transactions").AddCpfTransactionInput
  ) => Promise<void>;
  saveBudgetMonth: (month: string, next: DashboardState["budget"]) => Promise<void>;
  saveCards: (next: DashboardState["creditCards"]) => Promise<void>;
  saveHoldings: (next: DashboardState["holdings"]) => Promise<void>;
  recordHoldingDividend: (
    holdingId: string,
    payload: { perShare: number; qty?: number; occurredAt?: string; note?: string }
  ) => Promise<void>;
  deleteHoldingDividend: (holdingId: string, dividendId: string) => Promise<void>;
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
  ensureLoaded: () => void;
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
  /** Set when the last load failed; editing is blocked until a reload succeeds. */
  loadError: string | null;
  reload: () => Promise<void>;
  ensureLoaded: () => void;
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
  ensureLoaded: () => void;
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
  deleteFundTransaction: (fundId: string, transactionId: string) => Promise<void>;
};

export type MilesContextValue = {
  balances: MilesBalance[];
  totals: MilesTotals | null;
  loading: boolean;
  configured: boolean;
  reload: () => Promise<void>;
  ensureLoaded: () => void;
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
  ensureLoaded: () => void;
  sendInvite: (email: string) => Promise<void>;
  respondInvite: (id: string, action: "accept" | "decline" | "cancel") => Promise<void>;
  unlinkPartner: () => Promise<void>;
};

export type FinancialAccountsContextValue = {
  accounts: FinancialAccount[];
  loading: boolean;
  configured: boolean;
  reload: () => Promise<void>;
  ensureLoaded: () => void;
};

export type BenefitsContextValue = {
  benefits: BenefitUsage[];
  loading: boolean;
  configured: boolean;
  reload: () => Promise<void>;
  ensureLoaded: () => void;
  save: (incoming: BenefitInput[]) => Promise<void>;
  logClaim: (
    benefitId: string,
    input: { amount: number; claimedAt?: string; note?: string }
  ) => Promise<void>;
  updateClaim: (
    benefitId: string,
    claimId: string,
    patch: { amount?: number; claimedAt?: string; note?: string }
  ) => Promise<void>;
  deleteClaim: (benefitId: string, claimId: string) => Promise<void>;
};

export type OutstandingCardStatementsContextValue = {
  statements: CardStatementComputed[];
  loading: boolean;
  reload: () => Promise<void>;
  ensureLoaded: () => void;
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
export const BenefitsContext = createContext<BenefitsContextValue | null>(null);
export const OutstandingCardStatementsContext =
  createContext<OutstandingCardStatementsContextValue | null>(null);
