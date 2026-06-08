import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatTransactionDate,
  formatTransactionTime,
} from "@/lib/savings/format-transaction-when";
import { listAllTransactions, sumSavingsTransactionAmounts } from "@/lib/savings/ledger";
import type { SavingsTransaction } from "@/lib/savings/types";
import { listBudgetTransactions } from "@/lib/budget/transactions";
import type { BudgetTransaction } from "@/lib/transactions/types";
import {
  expenseToUnified,
  listExpensesForTransactions,
  sumExpenseAmountsForTransactions,
} from "@/lib/expenses/list-for-transactions";
import { sumBudgetTransactionAmounts } from "@/lib/budget/transactions";
import type { ListUnifiedOpts, UnifiedTransaction } from "@/lib/transactions/types";
import { sgtSpentAtToIso } from "@/lib/time/sgt";

function budgetSortAt(tx: BudgetTransaction): string {
  return sgtSpentAtToIso(tx.spentAt, tx.spentTime ?? "00:00:00");
}

function signedBudgetAmount(tx: BudgetTransaction): number {
  if (tx.transactionType === "income") return tx.amount;
  return -tx.amount;
}

export function savingsToUnified(tx: SavingsTransaction): UnifiedTransaction {
  const category =
    tx.incomeCategoryName ??
    (tx.excludeFromBudget ? "Excluded from budget" : null);
  return {
    id: tx.id,
    recordType: "savings",
    sortAt: tx.occurredAt,
    date: formatTransactionDate(tx.occurredAt),
    time: formatTransactionTime(tx.occurredAt),
    typeLabel: tx.kind,
    amount: tx.amount,
    accountName: tx.sourceName ?? null,
    ledger: null,
    category,
    subcategory: null,
    currency: "SGD",
    recorder: null,
    tag: null,
    note: tx.note,
    goalName: tx.goalName,
    balanceAfter: tx.balanceAfter,
    transactionType: null,
    savingsKind: tx.kind,
    financialAccountId: null,
    savingsAccountId: tx.accountId,
    poolId: tx.poolId,
    goalId: tx.goalId,
    spentAt: null,
    spentTime: null,
    occurredAt: tx.occurredAt,
  };
}

export function budgetToUnified(tx: BudgetTransaction): UnifiedTransaction {
  const sortAt = budgetSortAt(tx);
  return {
    id: tx.id,
    recordType: "budget",
    sortAt,
    date: formatTransactionDate(sortAt),
    time: formatTransactionTime(sortAt),
    typeLabel: tx.transactionType,
    amount: signedBudgetAmount(tx),
    accountName: tx.accountName,
    ledger: tx.ledger || null,
    category: tx.category || null,
    subcategory: tx.subcategory || null,
    currency: tx.currency,
    recorder: tx.recorder || null,
    tag: tx.tag || null,
    note: tx.note,
    goalName: null,
    balanceAfter: null,
    transactionType: tx.transactionType,
    savingsKind: null,
    financialAccountId: tx.financialAccountId,
    savingsAccountId: null,
    poolId: null,
    goalId: null,
    spentAt: tx.spentAt,
    spentTime: tx.spentTime,
    occurredAt: null,
  };
}

type ResolvedAccountFilters = {
  accountId?: string;
  poolId?: string;
  financialAccountId?: string;
};

/** Resolve savings + financial account ids so all streams filter consistently. */
export async function resolveAccountFilters(
  supabase: SupabaseClient,
  userId: string,
  opts: ListUnifiedOpts
): Promise<ResolvedAccountFilters> {
  const resolved: ResolvedAccountFilters = { poolId: opts.poolId };

  if (opts.financialAccountId) {
    resolved.financialAccountId = opts.financialAccountId;
    const { data, error } = await supabase
      .from("financial_accounts")
      .select("savings_account_id")
      .eq("id", opts.financialAccountId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.savings_account_id) {
      resolved.accountId = String(data.savings_account_id);
    } else if (opts.accountId) {
      resolved.accountId = opts.accountId;
    }
    console.info("[transactions] resolved account filters (from financial account)", {
      userId,
      financialAccountId: resolved.financialAccountId,
      accountId: resolved.accountId ?? null,
    });
    return resolved;
  }

  if (opts.accountId) {
    resolved.accountId = opts.accountId;
    const { data, error } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("savings_account_id", opts.accountId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.id) {
      resolved.financialAccountId = String(data.id);
    }
    console.info("[transactions] resolved account filters (from savings account)", {
      userId,
      accountId: resolved.accountId,
      financialAccountId: resolved.financialAccountId ?? null,
    });
    return resolved;
  }

  return resolved;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function unifiedListHasFilters(opts: ListUnifiedOpts): boolean {
  return Boolean(
    opts.accountId ||
      opts.poolId ||
      opts.financialAccountId ||
      opts.kind ||
      opts.transactionType ||
      (opts.source && opts.source !== "all") ||
      opts.dateFrom ||
      opts.dateTo
  );
}

export async function listUnifiedTransactions(
  supabase: SupabaseClient,
  userId: string,
  opts: ListUnifiedOpts = {}
) {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const source = opts.source ?? "all";

  const includeSavings =
    (source === "all" || source === "savings") && !opts.transactionType;
  const includeBudget =
    (source === "all" || source === "budget") && !opts.kind;
  const includeExpenses =
    (source === "all" || source === "expense") &&
    !opts.kind &&
    opts.transactionType !== "income";

  const accountFilters = await resolveAccountFilters(supabase, userId, opts);

  const skipSavingsForCardOnly =
    Boolean(accountFilters.financialAccountId) &&
    !accountFilters.accountId &&
    !accountFilters.poolId;

  const fetchSavings = includeSavings && !skipSavingsForCardOnly;
  const fetchBudget = includeBudget;
  const fetchExpenses = includeExpenses;

  const window = offset + limit;

  const [savingsPage, budgetPage, expensePage] = await Promise.all([
    fetchSavings
      ? listAllTransactions(supabase, {
          limit: window,
          offset: 0,
          accountId: accountFilters.accountId,
          poolId: accountFilters.poolId,
          kind: opts.kind,
          dateFrom: opts.dateFrom,
          dateTo: opts.dateTo,
        })
      : Promise.resolve({ items: [], total: 0, nextOffset: null }),
    fetchBudget
      ? listBudgetTransactions(supabase, userId, {
          limit: window,
          offset: 0,
          financialAccountId: accountFilters.financialAccountId,
          transactionType: opts.transactionType,
          dateFrom: opts.dateFrom,
          dateTo: opts.dateTo,
        })
      : Promise.resolve({ items: [], total: 0, nextOffset: null }),
    fetchExpenses
      ? listExpensesForTransactions(supabase, userId, {
          limit: window,
          offset: 0,
          financialAccountId: accountFilters.financialAccountId,
          transactionType: opts.transactionType,
          dateFrom: opts.dateFrom,
          dateTo: opts.dateTo,
        })
      : Promise.resolve({ items: [], total: 0, nextOffset: null }),
  ]);

  const savingsTotal = fetchSavings ? savingsPage.total : 0;
  const budgetTotal = fetchBudget ? budgetPage.total : 0;
  const expenseTotal = fetchExpenses ? expensePage.total : 0;

  const merged = [
    ...savingsPage.items.map(savingsToUnified),
    ...budgetPage.items.map(budgetToUnified),
    ...expensePage.items.map(expenseToUnified),
  ].sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));

  const items = merged.slice(offset, offset + limit);
  const total = savingsTotal + budgetTotal + expenseTotal;
  const nextOffset = offset + items.length < total ? offset + limit : null;

  let amountTotal: number | null = null;
  if (unifiedListHasFilters(opts)) {
    const [savingsSum, budgetSum, expenseSum] = await Promise.all([
      fetchSavings
        ? sumSavingsTransactionAmounts(supabase, {
            accountId: accountFilters.accountId,
            poolId: accountFilters.poolId,
            kind: opts.kind,
            dateFrom: opts.dateFrom,
            dateTo: opts.dateTo,
          })
        : Promise.resolve(0),
      fetchBudget
        ? sumBudgetTransactionAmounts(supabase, userId, {
            financialAccountId: accountFilters.financialAccountId,
            transactionType: opts.transactionType,
            dateFrom: opts.dateFrom,
            dateTo: opts.dateTo,
          })
        : Promise.resolve(0),
      fetchExpenses
        ? sumExpenseAmountsForTransactions(supabase, userId, {
            financialAccountId: accountFilters.financialAccountId,
            transactionType: opts.transactionType,
            dateFrom: opts.dateFrom,
            dateTo: opts.dateTo,
          })
        : Promise.resolve(0),
    ]);
    amountTotal = roundCents(savingsSum + budgetSum + expenseSum);
    console.info("[transactions] filtered amount total", {
      userId,
      amountTotal,
      savingsSum,
      budgetSum,
      expenseSum,
    });
  }

  console.info("[transactions] unified list", {
    userId,
    returned: items.length,
    total,
    savings: savingsPage.items.length,
    budget: budgetPage.items.length,
    expenses: expensePage.items.length,
    dateFrom: opts.dateFrom ?? null,
    dateTo: opts.dateTo ?? null,
  });

  return { items, total, nextOffset, amountTotal };
}
