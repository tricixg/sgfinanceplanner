import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavingsTransaction, SavingsTransactionKind } from "@/lib/savings/types";
import { mapTransaction } from "@/lib/savings/db-mappers";
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
};

export async function applyTransaction(
  supabase: SupabaseClient,
  input: ApplyTransactionInput
): Promise<SavingsTransaction> {
  const amount = input.amount;
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Transaction amount must be non-zero");
  }

  const hasAccount = Boolean(input.accountId);
  const hasPool = Boolean(input.poolId);
  if (hasAccount === hasPool) {
    throw new Error("Specify exactly one of accountId or poolId");
  }

  const kind: SavingsTransactionKind =
    input.kind ?? (amount > 0 ? "deposit" : "withdrawal");
  const occurredAt = input.occurredAt ?? new Date().toISOString();

  let balanceAfter = 0;

  if (input.accountId) {
    const { data: acct, error: readErr } = await supabase
      .from("user_savings_accounts")
      .select("id, balance, user_id")
      .eq("id", input.accountId)
      .maybeSingle();

    if (readErr || !acct) {
      throw new Error(readErr?.message ?? "Account not found");
    }
    if (acct.user_id !== input.userId) {
      throw new Error("Forbidden");
    }

    balanceAfter = Number(acct.balance) + amount;
    if (balanceAfter < 0) {
      throw new Error("Insufficient balance");
    }

    const { error: updErr } = await supabase
      .from("user_savings_accounts")
      .update({
        balance: balanceAfter,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.accountId);

    if (updErr) throw new Error(updErr.message);
  } else if (input.poolId) {
    if (!input.householdId) {
      throw new Error("householdId required for pool transactions");
    }

    const { data: pool, error: readErr } = await supabase
      .from("savings_pools")
      .select("id, balance, household_id")
      .eq("id", input.poolId)
      .maybeSingle();

    if (readErr || !pool) {
      throw new Error(readErr?.message ?? "Pool not found");
    }
    if (pool.household_id !== input.householdId) {
      throw new Error("Pool not in household");
    }

    balanceAfter = Number(pool.balance) + amount;
    if (balanceAfter < 0) {
      throw new Error("Insufficient balance");
    }

    const { error: updErr } = await supabase
      .from("savings_pools")
      .update({
        balance: balanceAfter,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.poolId);

    if (updErr) throw new Error(updErr.message);
  }

  if (input.goalId) {
    const { data: goal, error: goalErr } = await supabase
      .from("savings_goals")
      .select("id, saved_amount, scope, owner_user_id, household_id")
      .eq("id", input.goalId)
      .maybeSingle();

    if (goalErr || !goal) {
      throw new Error(goalErr?.message ?? "Goal not found");
    }

    if (input.accountId) {
      if (goal.scope !== "individual" || goal.owner_user_id !== input.userId) {
        throw new Error("Choose a personal savings goal");
      }
    } else if (input.poolId) {
      if (
        goal.scope !== "shared" ||
        goal.household_id !== input.householdId
      ) {
        throw new Error("Choose a shared savings goal");
      }
    }

    const newSaved = Math.max(0, Number(goal.saved_amount) + amount);
    const { error: goalUpdErr } = await supabase
      .from("savings_goals")
      .update({
        saved_amount: newSaved,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.goalId);

    if (goalUpdErr) throw new Error(goalUpdErr.message);
  }

  const { data: row, error: insErr } = await supabase
    .from("savings_transactions")
    .insert({
      user_id: input.userId,
      household_id: input.householdId ?? null,
      account_id: input.accountId ?? null,
      pool_id: input.poolId ?? null,
      goal_id: input.goalId ?? null,
      kind,
      amount,
      balance_after: balanceAfter,
      note: input.note ?? "",
      occurred_at: occurredAt,
      expense_id: input.expenseId ?? null,
      income_category_id: input.incomeCategoryId ?? null,
      exclude_from_budget: input.excludeFromBudget ?? false,
    })
    .select("*")
    .single();

  if (insErr || !row) {
    throw new Error(insErr?.message ?? "Failed to record transaction");
  }

  console.info("[ledger] transaction applied", {
    userId: input.userId,
    kind,
    amount,
    accountId: input.accountId,
    poolId: input.poolId,
    goalId: input.goalId,
    expenseId: input.expenseId ?? null,
    incomeCategoryId: input.incomeCategoryId ?? null,
    excludeFromBudget: input.excludeFromBudget ?? false,
    balanceAfter,
  });

  const mapped = mapTransaction(row);
  if (input.goalId) {
    const { data: goalRow } = await supabase
      .from("savings_goals")
      .select("name")
      .eq("id", input.goalId)
      .maybeSingle();
    return { ...mapped, goalName: goalRow?.name ? String(goalRow.name) : null };
  }
  return mapped;
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
  accountId?: string;
  poolId?: string;
  kind?: SavingsTransactionKind;
  dateFrom?: string;
  dateTo?: string;
};

export async function listAllTransactions(
  supabase: SupabaseClient,
  opts: ListTransactionsOpts = {}
) {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  let query = supabase
    .from("savings_transactions")
    .select("*", { count: "exact" })
    .is("expense_id", null);

  if (opts.accountId) query = query.eq("account_id", opts.accountId);
  if (opts.poolId) query = query.eq("pool_id", opts.poolId);
  if (opts.kind) query = query.eq("kind", opts.kind);
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
