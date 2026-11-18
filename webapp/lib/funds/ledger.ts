import type { SupabaseClient } from "@supabase/supabase-js";
import type { FundTransaction, FundTransactionKind } from "@/lib/funds/types";
import { mapFundTransaction } from "@/lib/funds/db-mappers";
import { roundMoney } from "@/lib/cards/interest-accrual";
import { callLedgerRpc } from "@/lib/supabase/rpc";

export type ApplyFundTransactionInput = {
  userId: string;
  fundId: string;
  amount: number;
  occurredAt?: string;
  kind?: FundTransactionKind;
  note?: string;
  goalId?: string | null;
  /** Idempotency key (one per user action); a retry returns the original row. */
  clientRequestId?: string | null;
};

/** Migration that adds the fund ledger functions used below. */
export const FUND_LEDGER_MIGRATION = "071_fund_ledger_functions.sql";

type ApplyFundRpcResult = {
  transaction: Record<string, unknown>;
  goal_name: string | null;
  replayed: boolean;
};

/**
 * Fund balance, goal saved amount and fund_transactions row in one database
 * transaction; reports whether this was a replay of an earlier request.
 */
export async function applyFundTransactionWithReplay(
  supabase: SupabaseClient,
  input: ApplyFundTransactionInput
): Promise<{ transaction: FundTransaction; replayed: boolean }> {
  // Round here so float drift doesn't reach the database's balance < 0 check
  // and cause spurious "Insufficient balance" errors.
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Transaction amount must be non-zero");
  }

  const kind: FundTransactionKind = input.kind ?? (amount > 0 ? "deposit" : "withdrawal");
  const occurredAt = input.occurredAt ?? new Date().toISOString();

  const result = await callLedgerRpc<ApplyFundRpcResult>(
    supabase,
    "ledger_apply_fund_transaction",
    {
      p_user_id: input.userId,
      p_fund_id: input.fundId,
      p_amount: amount,
      p_kind: kind,
      p_occurred_at: occurredAt,
      p_note: input.note ?? "",
      p_goal_id: input.goalId ?? null,
      p_client_request_id: input.clientRequestId ?? null,
    },
    FUND_LEDGER_MIGRATION
  );

  console.info(
    result.replayed
      ? "[funds/ledger] transaction replayed (idempotency key)"
      : "[funds/ledger] transaction applied",
    { userId: input.userId, fundId: input.fundId, kind, goalId: input.goalId ?? null }
  );

  const mapped = mapFundTransaction(result.transaction);
  return {
    transaction: { ...mapped, goalName: result.goal_name ? String(result.goal_name) : null },
    replayed: result.replayed,
  };
}

export async function applyFundTransaction(
  supabase: SupabaseClient,
  input: ApplyFundTransactionInput
): Promise<FundTransaction> {
  return (await applyFundTransactionWithReplay(supabase, input)).transaction;
}

export async function deleteFundTransaction(
  supabase: SupabaseClient,
  userId: string,
  fundId: string,
  transactionId: string
): Promise<void> {
  // Reverses the fund balance and goal saved amount and deletes the row in
  // one database transaction ("Transaction not found" if it isn't yours).
  await callLedgerRpc<null>(
    supabase,
    "ledger_delete_fund_transaction",
    { p_user_id: userId, p_fund_id: fundId, p_transaction_id: transactionId },
    FUND_LEDGER_MIGRATION
  );

  console.info("[funds/ledger] transaction deleted with balance rollback", {
    userId,
    fundId,
    transactionId,
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
