import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatTransactionDate,
  formatTransactionTime,
} from "@/lib/savings/format-transaction-when";
import { listAllTransactions } from "@/lib/savings/ledger";
import type { SavingsTransaction } from "@/lib/savings/types";
import { listBudgetTransactions } from "@/lib/budget/transactions";
import type { BudgetTransaction } from "@/lib/transactions/types";
import type { ListUnifiedOpts, UnifiedTransaction } from "@/lib/transactions/types";

function budgetSortAt(tx: BudgetTransaction): string {
  const time = tx.spentTime ?? "00:00:00";
  return `${tx.spentAt}T${time.length === 5 ? `${time}:00` : time}`;
}

function signedBudgetAmount(tx: BudgetTransaction): number {
  if (tx.transactionType === "income") return tx.amount;
  return -tx.amount;
}

export function savingsToUnified(tx: SavingsTransaction): UnifiedTransaction {
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
    category: null,
    subcategory: null,
    currency: "SGD",
    recorder: null,
    tag: null,
    note: tx.note,
    goalName: tx.goalName,
    balanceAfter: tx.balanceAfter,
    transactionType: null,
    savingsKind: tx.kind,
  };
}

export function budgetToUnified(tx: BudgetTransaction): UnifiedTransaction {
  const sortAt = budgetSortAt(tx);
  return {
    id: tx.id,
    recordType: "budget",
    sortAt,
    date: tx.spentAt,
    time: tx.spentTime?.slice(0, 5) ?? "",
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
  };
}

async function resolveSavingsAccountFilter(
  supabase: SupabaseClient,
  userId: string,
  opts: ListUnifiedOpts
): Promise<{ accountId?: string; poolId?: string }> {
  if (opts.accountId) return { accountId: opts.accountId, poolId: opts.poolId };
  if (!opts.financialAccountId) return { poolId: opts.poolId };

  const { data } = await supabase
    .from("financial_accounts")
    .select("savings_account_id")
    .eq("id", opts.financialAccountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.savings_account_id) {
    return { accountId: String(data.savings_account_id), poolId: undefined };
  }
  return {};
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
    source !== "budget" && !opts.transactionType;
  const includeBudget =
    source !== "savings" && !opts.kind;

  const savingsFilter = await resolveSavingsAccountFilter(supabase, userId, opts);

  if (opts.financialAccountId && !savingsFilter.accountId && includeSavings) {
    // Credit card filter — savings rows only if explicitly on pool/account filters
    if (!opts.poolId && !opts.accountId) {
      // skip savings when filtering by card-only financial account
    }
  }

  const skipSavingsForCardOnly =
    Boolean(opts.financialAccountId) &&
    !savingsFilter.accountId &&
    !opts.accountId &&
    !opts.poolId;

  const fetchSavings = includeSavings && !skipSavingsForCardOnly;
  const fetchBudget = includeBudget;

  const window = offset + limit;

  const [savingsPage, budgetPage] = await Promise.all([
    fetchSavings
      ? listAllTransactions(supabase, {
          limit: window,
          offset: 0,
          accountId: savingsFilter.accountId ?? opts.accountId,
          poolId: savingsFilter.poolId ?? opts.poolId,
          kind: opts.kind,
        })
      : Promise.resolve({ items: [], total: 0, nextOffset: null }),
    fetchBudget
      ? listBudgetTransactions(supabase, userId, {
          limit: window,
          offset: 0,
          financialAccountId: opts.financialAccountId,
          transactionType: opts.transactionType,
        })
      : Promise.resolve({ items: [], total: 0, nextOffset: null }),
  ]);

  const savingsTotal = fetchSavings ? savingsPage.total : 0;
  const budgetTotal = fetchBudget ? budgetPage.total : 0;

  const merged = [
    ...savingsPage.items.map(savingsToUnified),
    ...budgetPage.items.map(budgetToUnified),
  ].sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0));

  const items = merged.slice(offset, offset + limit);
  const total = savingsTotal + budgetTotal;
  const nextOffset = offset + items.length < total ? offset + limit : null;

  console.info("[transactions] unified list", {
    userId,
    returned: items.length,
    total,
    savings: savingsPage.items.length,
    budget: budgetPage.items.length,
  });

  return { items, total, nextOffset };
}
