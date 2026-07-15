/** Investment fund (investment_funds) — deposit/withdraw + payout ledger, shown on the Investment tab. */
export type Fund = {
  id: string;
  userId: string;
  name: string;
  balance: number;
  notes: string;
  sortOrder: number;
  /** Lifetime sum of payout-kind transactions for this fund — shown as P&L. */
  lifetimePayouts: number;
};

export type FundTransactionKind = "deposit" | "withdrawal" | "payout";

export type FundTransaction = {
  id: string;
  userId: string;
  fundId: string;
  goalId: string | null;
  /** Resolved from savings_goals when listing history. */
  goalName: string | null;
  kind: FundTransactionKind;
  amount: number;
  balanceAfter: number | null;
  note: string;
  occurredAt: string;
  createdAt: string;
};

export type FundsTotals = {
  /** Sum of fund balances — counts toward net worth. */
  fundsBalanceTotal: number;
  /** Lifetime sum of payout-kind transactions across all funds. */
  fundsPnlTotal: number;
};

export type FundsBundle = {
  funds: Fund[];
  totals: FundsTotals;
};
