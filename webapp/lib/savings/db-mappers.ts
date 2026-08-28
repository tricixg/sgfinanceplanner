import {
  DEFAULT_EXPENSE_ENTRY_SOURCE,
  parseExpenseEntrySource,
} from "@/lib/expenses/entry-source";
import type {
  Expense,
  PartnerInvite,
  SavingsGoal,
  SavingsPool,
  SavingsTransaction,
  UserSavingsAccount,
} from "@/lib/savings/types";

export function mapAccount(row: Record<string, unknown>): UserSavingsAccount {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? ""),
    balance: Number(row.balance ?? 0),
    notes: String(row.notes ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    includeInSavings: row.include_in_savings !== false,
    hidden: row.hidden === true,
  };
}

export function mapPool(row: Record<string, unknown>): SavingsPool {
  return {
    id: String(row.id),
    householdId: String(row.household_id),
    name: String(row.name ?? ""),
    balance: Number(row.balance ?? 0),
    notes: String(row.notes ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    includeInSavings: row.include_in_savings !== false,
  };
}

export function mapTransaction(row: Record<string, unknown>): SavingsTransaction {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    householdId: row.household_id ? String(row.household_id) : null,
    accountId: row.account_id ? String(row.account_id) : null,
    poolId: row.pool_id ? String(row.pool_id) : null,
    goalId: row.goal_id ? String(row.goal_id) : null,
    goalName: null,
    kind: (row.kind === "withdrawal" || row.kind === "adjustment"
      ? row.kind
      : "deposit") as SavingsTransaction["kind"],
    amount: Number(row.amount ?? 0),
    balanceAfter: row.balance_after != null ? Number(row.balance_after) : null,
    note: String(row.note ?? ""),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
    incomeCategoryId: row.income_category_id ? String(row.income_category_id) : null,
    incomeCategoryName: null,
    excludeFromBudget: row.exclude_from_budget === true,
  };
}

export function mapGoal(row: Record<string, unknown>): SavingsGoal {
  return {
    id: String(row.id),
    scope: row.scope === "shared" ? "shared" : "individual",
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    householdId: row.household_id ? String(row.household_id) : null,
    name: String(row.name ?? ""),
    targetAmount: Number(row.target_amount ?? 0),
    savedAmount: Number(row.saved_amount ?? 0),
    startDate: row.start_date ? String(row.start_date) : null,
    targetDate: row.target_date ? String(row.target_date) : null,
    monthlyContribution: Number(row.monthly_contribution ?? 0),
    splits: row.splits && typeof row.splits === "object" && !Array.isArray(row.splits)
      ? (row.splits as Record<string, number>)
      : null,
    whereLabel: String(row.where_label ?? ""),
    linkedAccountId: row.linked_account_id ? String(row.linked_account_id) : null,
    linkedPoolId: row.linked_pool_id ? String(row.linked_pool_id) : null,
    linkedFundId: row.linked_fund_id ? String(row.linked_fund_id) : null,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function mapExpense(row: Record<string, unknown>): Expense {
  const auto = row.auto_category;
  const autoCategory =
    auto === "debt" ||
    auto === "insurance" ||
    auto === "ilp" ||
    auto === "subscription" ||
    auto === "invest"
      ? auto
      : null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    amount: Number(row.amount ?? 0),
    category: String(row.category ?? ""),
    budgetLineId: row.budget_line_id ? String(row.budget_line_id) : null,
    entrySource:
      parseExpenseEntrySource(row.entry_source) ?? DEFAULT_EXPENSE_ENTRY_SOURCE,
    autoCategory,
    loanId: row.loan_id ? String(row.loan_id) : null,
    otherLoanId: row.other_loan_id ? String(row.other_loan_id) : null,
    insurancePolicyId: row.insurance_policy_id ? String(row.insurance_policy_id) : null,
    ilpPolicyId: row.ilp_policy_id ? String(row.ilp_policy_id) : null,
    subscriptionId: row.subscription_id ? String(row.subscription_id) : null,
    investmentId: row.investment_id ? String(row.investment_id) : null,
    fundId: row.fund_id ? String(row.fund_id) : null,
    financialAccountId: row.financial_account_id
      ? String(row.financial_account_id)
      : null,
    spentAt: String(row.spent_at),
    spentTime: row.spent_time != null ? String(row.spent_time).slice(0, 8) : null,
    note: String(row.note ?? ""),
    createdAt: String(row.created_at),
  };
}

export function mapInvite(row: Record<string, unknown>): PartnerInvite {
  return {
    id: String(row.id),
    householdId: String(row.household_id),
    inviterId: String(row.inviter_id),
    inviterEmail: row.inviter_email ? String(row.inviter_email) : null,
    inviteeEmail: String(row.invitee_email),
    status: String(row.status),
    createdAt: String(row.created_at),
  };
}
