import type { SavingsTransactionKind } from "@/lib/savings/types";

export type FinancialAccountType = "cash" | "credit_card";

export type FinancialAccount = {
  id: string;
  userId: string;
  name: string;
  accountType: FinancialAccountType;
  savingsAccountId: string | null;
  cardKey: string | null;
  sortOrder: number;
};

export type BudgetTransactionType = "expense" | "subscription" | "income";

export type BudgetTransaction = {
  id: string;
  userId: string;
  financialAccountId: string | null;
  accountName: string | null;
  ledger: string;
  category: string;
  subcategory: string;
  currency: string;
  amount: number;
  recorder: string;
  spentAt: string;
  spentTime: string | null;
  tag: string;
  note: string;
  transactionType: BudgetTransactionType;
  importBatchId: string | null;
  createdAt: string;
};

export type TransactionRecordType = "savings" | "budget" | "expense";

/** Row shown on /transactions (savings ledger + budget import). */
export type UnifiedTransaction = {
  id: string;
  recordType: TransactionRecordType;
  sortAt: string;
  date: string;
  time: string;
  typeLabel: string;
  amount: number;
  accountName: string | null;
  ledger: string | null;
  category: string | null;
  subcategory: string | null;
  currency: string | null;
  recorder: string | null;
  tag: string | null;
  note: string;
  goalName: string | null;
  balanceAfter: number | null;
  /** Budget: expense | subscription | income */
  transactionType: BudgetTransactionType | null;
  /** Savings: deposit | withdrawal | adjustment */
  savingsKind: SavingsTransactionKind | null;
  financialAccountId?: string | null;
  savingsAccountId?: string | null;
  poolId?: string | null;
  goalId?: string | null;
  spentAt?: string | null;
  spentTime?: string | null;
  occurredAt?: string | null;
};

export type ListUnifiedOpts = {
  limit?: number;
  offset?: number;
  accountId?: string;
  poolId?: string;
  financialAccountId?: string;
  kind?: SavingsTransactionKind;
  transactionType?: BudgetTransactionType;
  source?: "all" | "savings" | "budget" | "expense";
  /** Inclusive YYYY-MM-DD */
  dateFrom?: string;
  /** Inclusive YYYY-MM-DD */
  dateTo?: string;
};
