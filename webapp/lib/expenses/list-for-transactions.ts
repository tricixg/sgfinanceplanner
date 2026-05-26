import type { SupabaseClient } from "@supabase/supabase-js";
import { mapExpense } from "@/lib/savings/db-mappers";
import {
  formatTransactionDate,
  formatTransactionTime,
} from "@/lib/savings/format-transaction-when";
import type { Expense } from "@/lib/savings/types";
import type { BudgetTransactionType, UnifiedTransaction } from "@/lib/transactions/types";

export type ExpenseForTransaction = Expense & {
  accountName: string | null;
  balanceAfter: number | null;
};

export type ListExpensesForTransactionsOpts = {
  limit?: number;
  offset?: number;
  financialAccountId?: string;
  transactionType?: BudgetTransactionType;
  dateFrom?: string;
  dateTo?: string;
};

export function expenseMatchesTransactionType(
  expense: Expense,
  transactionType: BudgetTransactionType
): boolean {
  if (transactionType === "income") return false;
  if (transactionType === "subscription") {
    return expense.autoCategory === "subscription";
  }
  return expense.autoCategory !== "subscription";
}

export function expenseToUnified(expense: ExpenseForTransaction): UnifiedTransaction {
  const typeLabel = expense.autoCategory ?? "expense";
  const when = expense.createdAt || `${expense.spentAt}T00:00:00Z`;
  return {
    id: expense.id,
    recordType: "expense",
    sortAt: when,
    date: formatTransactionDate(when),
    time: formatTransactionTime(when),
    typeLabel,
    amount: -expense.amount,
    accountName: expense.accountName,
    ledger: null,
    category: expense.category || null,
    subcategory: null,
    currency: "SGD",
    recorder: null,
    tag: null,
    note: expense.note,
    goalName: null,
    balanceAfter: expense.balanceAfter,
    transactionType:
      expense.autoCategory === "subscription" ? "subscription" : "expense",
    savingsKind: null,
  };
}


export async function listExpensesForTransactions(
  supabase: SupabaseClient,
  userId: string,
  opts: ListExpensesForTransactionsOpts = {}
): Promise<{ items: ExpenseForTransaction[]; total: number; nextOffset: number | null }> {
  if (opts.transactionType === "income") {
    return { items: [], total: 0, nextOffset: null };
  }

  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  let query = supabase
    .from("expenses")
    .select("*, financial_accounts(name)", { count: "exact" })
    .eq("user_id", userId);

  if (opts.financialAccountId) {
    query = query.eq("financial_account_id", opts.financialAccountId);
  }

  if (opts.transactionType === "subscription") {
    query = query.eq("auto_category", "subscription");
  } else if (opts.transactionType === "expense") {
    query = query.or("auto_category.is.null,auto_category.neq.subscription");
  }
  if (opts.dateFrom) query = query.gte("spent_at", opts.dateFrom);
  if (opts.dateTo) query = query.lte("spent_at", opts.dateTo);

  const { data, error, count } = await query
    .order("spent_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  let rows: ExpenseForTransaction[] = (data ?? []).map((row) => {
    const expense = mapExpense(row);
    const fa = row.financial_accounts as Record<string, unknown> | null | undefined;
    const accountName = fa?.name != null ? String(fa.name).trim() || null : null;
    return { ...expense, accountName, balanceAfter: null };
  });

  const expenseIds = rows.map((e) => e.id);
  if (expenseIds.length) {
    const { data: savingsRows } = await supabase
      .from("savings_transactions")
      .select("expense_id, balance_after")
      .in("expense_id", expenseIds)
      .eq("user_id", userId);

    const balanceByExpense = new Map<string, number>();
    for (const sr of savingsRows ?? []) {
      if (sr.expense_id != null && sr.balance_after != null) {
        balanceByExpense.set(String(sr.expense_id), Number(sr.balance_after));
      }
    }

    rows = rows.map((e) => ({
      ...e,
      balanceAfter: balanceByExpense.get(e.id) ?? null,
    }));
  }

  return {
    items: rows,
    total: count ?? 0,
    nextOffset:
      offset + (data?.length ?? 0) < (count ?? 0) ? offset + limit : null,
  };
}
