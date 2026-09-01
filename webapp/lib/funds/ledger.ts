import type { SupabaseClient } from "@supabase/supabase-js";
import type { FundTransaction, FundTransactionKind } from "@/lib/funds/types";
import { mapFundTransaction } from "@/lib/funds/db-mappers";

export type ApplyFundTransactionInput = {
  userId: string;
  fundId: string;
  amount: number;
  occurredAt?: string;
  kind?: FundTransactionKind;
  note?: string;
  goalId?: string | null;
};

export async function applyFundTransaction(
  supabase: SupabaseClient,
  input: ApplyFundTransactionInput
): Promise<FundTransaction> {
  const amount = input.amount;
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Transaction amount must be non-zero");
  }

  const kind: FundTransactionKind = input.kind ?? (amount > 0 ? "deposit" : "withdrawal");
  const occurredAt = input.occurredAt ?? new Date().toISOString();

  const { data: fund, error: readErr } = await supabase
    .from("investment_funds")
    .select("id, balance, user_id")
    .eq("id", input.fundId)
    .maybeSingle();

  if (readErr || !fund) {
    throw new Error(readErr?.message ?? "Fund not found");
  }
  if (fund.user_id !== input.userId) {
    throw new Error("Forbidden");
  }

  const balanceAfter = Number(fund.balance) + amount;
  if (balanceAfter < 0) {
    throw new Error("Insufficient balance");
  }

  // Validate the goal (if any) *before* mutating anything — a validation
  // failure here must not leave the fund balance decremented with no
  // matching transaction row.
  let goal: { id: string; saved_amount: number; name: string | null } | null = null;
  if (input.goalId) {
    const { data: goalRow, error: goalErr } = await supabase
      .from("savings_goals")
      .select("id, saved_amount, scope, owner_user_id, name")
      .eq("id", input.goalId)
      .maybeSingle();

    if (goalErr || !goalRow) {
      throw new Error(goalErr?.message ?? "Goal not found");
    }
    if (goalRow.scope !== "individual" || goalRow.owner_user_id !== input.userId) {
      throw new Error("Choose a personal savings goal");
    }
    goal = { id: goalRow.id, saved_amount: Number(goalRow.saved_amount), name: goalRow.name };
  }

  const { error: updErr } = await supabase
    .from("investment_funds")
    .update({ balance: balanceAfter, updated_at: new Date().toISOString() })
    .eq("id", input.fundId);

  if (updErr) throw new Error(updErr.message);

  const revertFundBalance = async () => {
    await supabase
      .from("investment_funds")
      .update({ balance: fund.balance, updated_at: new Date().toISOString() })
      .eq("id", input.fundId);
  };

  if (goal) {
    const newSaved = Math.max(0, goal.saved_amount + amount);
    const { error: goalUpdErr } = await supabase
      .from("savings_goals")
      .update({ saved_amount: newSaved, updated_at: new Date().toISOString() })
      .eq("id", goal.id);

    if (goalUpdErr) {
      await revertFundBalance();
      throw new Error(goalUpdErr.message);
    }
  }

  const revertGoalSaved = async () => {
    if (!goal) return;
    await supabase
      .from("savings_goals")
      .update({ saved_amount: goal.saved_amount, updated_at: new Date().toISOString() })
      .eq("id", goal.id);
  };

  const { data: row, error: insErr } = await supabase
    .from("fund_transactions")
    .insert({
      user_id: input.userId,
      fund_id: input.fundId,
      goal_id: input.goalId ?? null,
      kind,
      amount,
      balance_after: balanceAfter,
      note: input.note ?? "",
      occurred_at: occurredAt,
    })
    .select("*")
    .single();

  if (insErr || !row) {
    await revertGoalSaved();
    await revertFundBalance();
    throw new Error(insErr?.message ?? "Failed to record transaction");
  }

  console.info("[funds/ledger] transaction applied", {
    userId: input.userId,
    fundId: input.fundId,
    kind,
    amount,
    goalId: input.goalId ?? null,
    balanceAfter,
  });

  const mapped = mapFundTransaction(row);
  return { ...mapped, goalName: goal?.name ? String(goal.name) : null };
}

export async function deleteFundTransaction(
  supabase: SupabaseClient,
  userId: string,
  fundId: string,
  transactionId: string
): Promise<void> {
  const { data: tx, error: readErr } = await supabase
    .from("fund_transactions")
    .select("id, amount, goal_id")
    .eq("id", transactionId)
    .eq("fund_id", fundId)
    .eq("user_id", userId)
    .maybeSingle();

  if (readErr) throw new Error(readErr.message);
  if (!tx) throw new Error("Transaction not found");

  const reverse = -Number(tx.amount);

  const { data: fund, error: fundErr } = await supabase
    .from("investment_funds")
    .select("balance")
    .eq("id", fundId)
    .maybeSingle();
  if (fundErr || !fund) throw new Error(fundErr?.message ?? "Fund not found");

  const nextBalance = Number(fund.balance) + reverse;
  if (nextBalance < 0) throw new Error("Insufficient balance");

  const { error: updErr } = await supabase
    .from("investment_funds")
    .update({ balance: nextBalance, updated_at: new Date().toISOString() })
    .eq("id", fundId);
  if (updErr) throw new Error(updErr.message);

  if (tx.goal_id) {
    const { data: goal, error: goalErr } = await supabase
      .from("savings_goals")
      .select("saved_amount")
      .eq("id", tx.goal_id)
      .maybeSingle();
    if (goalErr || !goal) throw new Error(goalErr?.message ?? "Goal not found");
    const nextSaved = Math.max(0, Number(goal.saved_amount) + reverse);
    const { error: goalUpdErr } = await supabase
      .from("savings_goals")
      .update({ saved_amount: nextSaved, updated_at: new Date().toISOString() })
      .eq("id", tx.goal_id);
    if (goalUpdErr) throw new Error(goalUpdErr.message);
  }

  const { error: delErr } = await supabase
    .from("fund_transactions")
    .delete()
    .eq("id", transactionId)
    .eq("fund_id", fundId)
    .eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);

  console.info("[funds/ledger] transaction deleted with balance rollback", {
    userId,
    fundId,
    transactionId,
    amount: tx.amount,
    goalId: tx.goal_id ?? null,
  });
}

async function enrichWithGoalNames(
  supabase: SupabaseClient,
  items: FundTransaction[]
): Promise<FundTransaction[]> {
  const goalIds = [
    ...new Set(items.map((t) => t.goalId).filter((id): id is string => Boolean(id))),
  ];
  if (!goalIds.length) return items;

  const { data: goals, error } = await supabase
    .from("savings_goals")
    .select("id, name")
    .in("id", goalIds);

  if (error) {
    console.warn("[funds/ledger] goal name lookup failed", error.message);
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

export async function listFundTransactions(
  supabase: SupabaseClient,
  fundId: string,
  opts: { limit?: number; offset?: number } = {}
) {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const { data, error, count } = await supabase
    .from("fund_transactions")
    .select("*", { count: "exact" })
    .eq("fund_id", fundId)
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  const items = await enrichWithGoalNames(
    supabase,
    (data ?? []).map((r) => mapFundTransaction(r))
  );

  return {
    items,
    total: count ?? 0,
    nextOffset: offset + (data?.length ?? 0) < (count ?? 0) ? offset + limit : null,
  };
}

/** Lifetime payout-kind transactions for a user, both overall and broken down per fund. */
export async function loadFundPayoutTotals(
  supabase: SupabaseClient,
  userId: string
): Promise<{ total: number; byFund: Record<string, number> }> {
  const { data, error } = await supabase
    .from("fund_transactions")
    .select("fund_id, amount")
    .eq("user_id", userId)
    .eq("kind", "payout");

  if (error) {
    console.warn("[funds/ledger] payout totals failed", error.message);
    return { total: 0, byFund: {} };
  }

  const byFund: Record<string, number> = {};
  let total = 0;
  for (const row of data ?? []) {
    const amount = Number(row.amount ?? 0);
    const fundId = String(row.fund_id);
    byFund[fundId] = (byFund[fundId] ?? 0) + amount;
    total += amount;
  }
  return { total, byFund };
}
