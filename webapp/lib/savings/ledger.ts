import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavingsTransaction, SavingsTransactionKind } from "@/lib/savings/types";
import { mapTransaction } from "@/lib/savings/db-mappers";
import { roundMoney } from "@/lib/cards/interest-accrual";
import { callLedgerRpc } from "@/lib/supabase/rpc";
import {
  accountIdInSavingsScope,
  loadSavingsVisibilityScope,
  poolIdInSavingsScope,
  savingsScopeOrFilter,
  type SavingsVisibilityScope,
} from "@/lib/savings/visibility-scope";
import {
  savingsOccurredAtLowerBound,
  savingsOccurredAtUpperBoundExclusive,
} from "@/lib/transactions/date-range";

export type ApplyTransactionInput = {
  userId: string;
  amount: number;
  occurredAt?: string;
  kind?: SavingsTransactionKind;
  note?: string;
  goalId?: string | null;
  accountId?: string | null;
  poolId?: string | null;
  householdId?: string | null;
  expenseId?: string | null;
  incomeCategoryId?: string | null;
  excludeFromBudget?: boolean;
  sourceRecordType?: "expense" | "savings" | "budget" | "other_loan" | null;
  sourceRecordId?: string | null;
  /**
   * Idempotency key (one per user action). A retry with the same key returns
   * the original transaction instead of moving the balance again.
   */
  clientRequestId?: string | null;
};

/** Migration that adds the savings ledger functions used below. */
export const SAVINGS_LEDGER_MIGRATION = "070_savings_ledger_functions.sql";

type ApplySavingsRpcResult = {
  transaction: Record<string, unknown>;
  goal_name: string | null;
  replayed: boolean;
};

/**
 * Applies a savings transaction atomically (balance, goal saved amount and
 * ledger row in one database transaction) and reports whether it was an
 * idempotent replay of an earlier request with the same clientRequestId.
 */
export async function applyTransactionWithReplay(
  supabase: SupabaseClient,
  input: ApplyTransactionInput
): Promise<{ transaction: SavingsTransaction; replayed: boolean }> {
  // Round here so float drift (e.g. 0.1 + 0.2) doesn't reach the database's
  // balance < 0 check and cause spurious "Insufficient balance" errors.
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Transaction amount must be non-zero");
  }

  const hasAccount = Boolean(input.accountId);
  const hasPool = Boolean(input.poolId);
  if (hasAccount === hasPool) {
    throw new Error("Specify exactly one of accountId or poolId");
  }
  if (hasPool && !input.householdId) {
    throw new Error("householdId required for pool transactions");
  }

  const kind: SavingsTransactionKind =
    input.kind ?? (amount > 0 ? "deposit" : "withdrawal");
  const occurredAt = input.occurredAt ?? new Date().toISOString();

  const result = await callLedgerRpc<ApplySavingsRpcResult>(
    supabase,
    "ledger_apply_savings_transaction",
    {
      p_user_id: input.userId,
      p_amount: amount,
      p_kind: kind,
      p_occurred_at: occurredAt,
      p_note: input.note ?? "",
      p_goal_id: input.goalId ?? null,
      p_account_id: input.accountId ?? null,
      p_pool_id: input.poolId ?? null,
      p_household_id: input.householdId ?? null,
      p_expense_id: input.expenseId ?? null,
      p_income_category_id: input.incomeCategoryId ?? null,
      p_exclude_from_budget: input.excludeFromBudget ?? false,
      p_source_record_type: input.sourceRecordType ?? null,
      p_source_record_id: input.sourceRecordId ?? null,
      p_client_request_id: input.clientRequestId ?? null,
    },
    SAVINGS_LEDGER_MIGRATION
  );

  console.info(
    result.replayed ? "[ledger] transaction replayed (idempotency key)" : "[ledger] transaction applied",
    {
      userId: input.userId,
      kind,
      accountId: input.accountId,
      poolId: input.poolId,
      goalId: input.goalId,
      expenseId: input.expenseId ?? null,
      incomeCategoryId: input.incomeCategoryId ?? null,
      excludeFromBudget: input.excludeFromBudget ?? false,
    }
  );

  const mapped = mapTransaction(result.transaction);
  const transaction = mapped.goalId
    ? { ...mapped, goalName: result.goal_name ? String(result.goal_name) : null }
    : mapped;
  return { transaction, replayed: result.replayed };
}

export async function applyTransaction(
  supabase: SupabaseClient,
  input: ApplyTransactionInput
): Promise<SavingsTransaction> {
  return (await applyTransactionWithReplay(supabase, input)).transaction;
}

async function enrichTransactionsWithIncomeCategoryNames(
  supabase: SupabaseClient,
  items: SavingsTransaction[]
): Promise<SavingsTransaction[]> {
  const ids = [
    ...new Set(
      items.map((t) => t.incomeCategoryId).filter((id): id is string => Boolean(id))
    ),
  ];
  if (!ids.length) return items;

  const { data, error } = await supabase
    .from("income_categories")
    .select("id, name")
    .in("id", ids);

  if (error) {
    console.warn("[ledger] income category name lookup failed", error.message);
    return items;
  }

  const names = new Map(
    (data ?? []).map((r) => [String(r.id), String(r.name ?? "").trim()])
  );

  return items.map((t) => ({
    ...t,
    incomeCategoryName: t.incomeCategoryId
      ? names.get(t.incomeCategoryId) ?? null
      : null,
  }));
}

async function enrichTransactionsWithGoalNames(
  supabase: SupabaseClient,
  items: SavingsTransaction[]
): Promise<SavingsTransaction[]> {
  const goalIds = [
    ...new Set(items.map((t) => t.goalId).filter((id): id is string => Boolean(id))),
  ];
  if (!goalIds.length) {
    return items.map((t) => ({ ...t, goalName: t.goalName ?? null }));
  }

  const { data: goals, error } = await supabase
    .from("savings_goals")
    .select("id, name")
    .in("id", goalIds);

  if (error) {
    console.warn("[ledger] goal name lookup failed", error.message);
    return items;
  }

  const names = new Map(
    (goals ?? []).map((g) => [String(g.id), String(g.name ?? "").trim() || "Goal"])
  );

  return items.map((t) => ({
    ...t,
    goalName: t.goalId ? names.get(t.goalId) ?? null : null,
  }));
}

async function enrichTransactionsWithSourceNames(
  supabase: SupabaseClient,
  items: SavingsTransaction[]
): Promise<SavingsTransaction[]> {
  const accountIds = [
    ...new Set(
      items.map((t) => t.accountId).filter((id): id is string => Boolean(id))
    ),
  ];
  const poolIds = [
    ...new Set(items.map((t) => t.poolId).filter((id): id is string => Boolean(id))),
  ];

  const accountNames = new Map<string, string>();
  const poolNames = new Map<string, string>();

  if (accountIds.length) {
    const { data, error } = await supabase
      .from("user_savings_accounts")
      .select("id, name")
      .in("id", accountIds);
    if (error) {
      console.warn("[ledger] account name lookup failed", error.message);
    } else {
      for (const row of data ?? []) {
        accountNames.set(
          String(row.id),
          String(row.name ?? "").trim() || "Cash account"
        );
      }
    }
  }

  if (poolIds.length) {
    const { data, error } = await supabase
      .from("savings_pools")
      .select("id, name")
      .in("id", poolIds);
    if (error) {
      console.warn("[ledger] pool name lookup failed", error.message);
    } else {
      for (const row of data ?? []) {
        poolNames.set(String(row.id), String(row.name ?? "").trim() || "Shared pool");
      }
    }
  }

  return items.map((t) => {
    if (t.accountId) {
      return {
        ...t,
        sourceType: "account" as const,
        sourceName: accountNames.get(t.accountId) ?? null,
      };
    }
    if (t.poolId) {
      return {
        ...t,
        sourceType: "pool" as const,
        sourceName: poolNames.get(t.poolId) ?? null,
      };
    }
    return { ...t, sourceType: null, sourceName: null };
  });
}

export type ListTransactionsOpts = {
  limit?: number;
  offset?: number;
  userId?: string;
  accountId?: string;
  poolId?: string;
  kind?: SavingsTransactionKind;
  dateFrom?: string;
  dateTo?: string;
  incomeCategoryId?: string;
  categoryBlank?: boolean;
  excludeFromBudget?: boolean;
};

type SavingsListFilterResult =
  | { ok: true; scope?: SavingsVisibilityScope }
  | { ok: false };

async function resolveSavingsListFilters(
  supabase: SupabaseClient,
  opts: Pick<ListTransactionsOpts, "userId" | "accountId" | "poolId">
): Promise<SavingsListFilterResult> {
  if (!opts.userId) return { ok: true };

  const scope = await loadSavingsVisibilityScope(supabase, opts.userId);

  if (opts.accountId && !accountIdInSavingsScope(scope, opts.accountId)) {
    console.warn("[ledger] account not in user savings scope", {
      userId: opts.userId,
      accountId: opts.accountId,
    });
    return { ok: false };
  }
  if (opts.poolId && !poolIdInSavingsScope(scope, opts.poolId)) {
    console.warn("[ledger] pool not in user savings scope", {
      userId: opts.userId,
      poolId: opts.poolId,
    });
    return { ok: false };
  }
  if (!opts.accountId && !opts.poolId && !savingsScopeOrFilter(scope)) {
    return { ok: false };
  }

  return { ok: true, scope };
}

function applySavingsVisibilityFilters<T>(
  query: T,
  opts: Pick<ListTransactionsOpts, "accountId" | "poolId">,
  scope?: SavingsVisibilityScope
): T {
  const q = query as {
    eq: (column: string, value: string) => T;
    or: (filters: string) => T;
  };
  if (opts.accountId) {
    return q.eq("account_id", opts.accountId);
  }
  if (opts.poolId) {
    return q.eq("pool_id", opts.poolId);
  }
  if (scope) {
    const orFilter = savingsScopeOrFilter(scope);
    if (orFilter) {
      return q.or(orFilter);
    }
  }
  return query;
}

export async function listAllTransactions(
  supabase: SupabaseClient,
  opts: ListTransactionsOpts = {}
) {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const filters = await resolveSavingsListFilters(supabase, opts);
  if (!filters.ok) {
    return { items: [], total: 0, nextOffset: null };
  }

  let query = supabase
    .from("savings_transactions")
    .select("*", { count: "exact" })
    .is("expense_id", null);

  query = applySavingsVisibilityFilters(query, opts, filters.scope);

  if (opts.kind) query = query.eq("kind", opts.kind);
  if (opts.incomeCategoryId) query = query.eq("income_category_id", opts.incomeCategoryId);
  if (opts.categoryBlank) {
    query = query.is("income_category_id", null).eq("exclude_from_budget", false);
  }
  if (opts.excludeFromBudget) {
    query = query.is("income_category_id", null).eq("exclude_from_budget", true);
  }
  if (opts.dateFrom) {
    query = query.gte("occurred_at", savingsOccurredAtLowerBound(opts.dateFrom));
  }
  if (opts.dateTo) {
    query = query.lt("occurred_at", savingsOccurredAtUpperBoundExclusive(opts.dateTo));
  }

  const { data, error, count } = await query
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  let items = (data ?? []).map((r) => mapTransaction(r));
  items = await enrichTransactionsWithIncomeCategoryNames(supabase, items);
  items = await enrichTransactionsWithGoalNames(supabase, items);
  items = await enrichTransactionsWithSourceNames(supabase, items);

  return {
    items,
    total: count ?? 0,
    nextOffset: offset + (data?.length ?? 0) < (count ?? 0) ? offset + limit : null,
  };
}

/** Sum signed amounts for savings ledger rows matching list filters. */
export async function sumSavingsTransactionAmounts(
  supabase: SupabaseClient,
  opts: Omit<ListTransactionsOpts, "limit" | "offset"> = {}
): Promise<number> {
  const filters = await resolveSavingsListFilters(supabase, opts);
  if (!filters.ok) return 0;

  let query = supabase
    .from("savings_transactions")
    .select("amount")
    .is("expense_id", null);

  query = applySavingsVisibilityFilters(query, opts, filters.scope);

  if (opts.kind) query = query.eq("kind", opts.kind);
  if (opts.incomeCategoryId) query = query.eq("income_category_id", opts.incomeCategoryId);
  if (opts.categoryBlank) {
    query = query.is("income_category_id", null).eq("exclude_from_budget", false);
  }
  if (opts.excludeFromBudget) {
    query = query.is("income_category_id", null).eq("exclude_from_budget", true);
  }
  if (opts.dateFrom) {
    query = query.gte("occurred_at", savingsOccurredAtLowerBound(opts.dateFrom));
  }
  if (opts.dateTo) {
    query = query.lt("occurred_at", savingsOccurredAtUpperBoundExclusive(opts.dateTo));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
}

export async function listAccountTransactions(
  supabase: SupabaseClient,
  accountId: string,
  opts: { limit?: number; offset?: number } = {}
) {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const { data, error, count } = await supabase
    .from("savings_transactions")
    .select("*", { count: "exact" })
    .eq("account_id", accountId)
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  const items = await enrichTransactionsWithIncomeCategoryNames(
    supabase,
    (data ?? []).map((r) => mapTransaction(r))
  );
  const withGoals = await enrichTransactionsWithGoalNames(supabase, items);

  return {
    items: withGoals,
    total: count ?? 0,
    nextOffset: offset + (data?.length ?? 0) < (count ?? 0) ? offset + limit : null,
  };
}

export async function listPoolTransactions(
  supabase: SupabaseClient,
  poolId: string,
  opts: { limit?: number; offset?: number } = {}
) {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const { data, error, count } = await supabase
    .from("savings_transactions")
    .select("*", { count: "exact" })
    .eq("pool_id", poolId)
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  const items = await enrichTransactionsWithIncomeCategoryNames(
    supabase,
    (data ?? []).map((r) => mapTransaction(r))
  );
  const withGoals = await enrichTransactionsWithGoalNames(supabase, items);

  return {
    items: withGoals,
    total: count ?? 0,
    nextOffset: offset + (data?.length ?? 0) < (count ?? 0) ? offset + limit : null,
  };
}

export async function listGoalTransactions(
  supabase: SupabaseClient,
  goalId: string,
  opts: { limit?: number; offset?: number } = {}
) {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const { data, error, count } = await supabase
    .from("savings_transactions")
    .select("*", { count: "exact" })
    .eq("goal_id", goalId)
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  const items = await enrichTransactionsWithIncomeCategoryNames(
    supabase,
    (data ?? []).map((r) => mapTransaction(r))
  );
  const withGoals = await enrichTransactionsWithGoalNames(supabase, items);

  return {
    items: withGoals,
    total: count ?? 0,
    nextOffset: offset + (data?.length ?? 0) < (count ?? 0) ? offset + limit : null,
  };
}

export async function getSavingsTransactionById(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<SavingsTransaction | null> {
  const { data, error } = await supabase
    .from("savings_transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapTransaction(data) : null;
}

export async function deleteSavingsTransaction(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<boolean> {
  // Reverses the account/pool balance and goal saved amount and deletes the
  // row in one database transaction.
  const deleted = await callLedgerRpc<boolean>(
    supabase,
    "ledger_delete_savings_transaction",
    { p_user_id: userId, p_transaction_id: id },
    SAVINGS_LEDGER_MIGRATION
  );
  if (!deleted) return false;

  console.info("[ledger] transaction deleted with balance rollback", { userId, id });
  return true;
}
