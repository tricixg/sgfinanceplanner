import type { SupabaseClient } from "@supabase/supabase-js";

export type ReimbursementTotalsBySource = {
  expense: Map<string, number>;
  budget: Map<string, number>;
};

const AMOUNT_EPS = 0.001;

export function netBudgetSpend(gross: number, reimbursed: number): number {
  const net = Math.round((gross - reimbursed) * 100) / 100;
  return net <= AMOUNT_EPS ? 0 : Math.max(0, net);
}

function addToMap(map: Map<string, number>, id: string, amount: number): void {
  if (!(amount > 0)) return;
  map.set(id, (map.get(id) ?? 0) + amount);
}

/** Sum linked reimbursement deposits / income by source record id. */
export async function loadReimbursementTotals(
  supabase: SupabaseClient,
  userId: string
): Promise<ReimbursementTotalsBySource> {
  const expense = new Map<string, number>();
  const budget = new Map<string, number>();

  const [savingsRes, budgetRes] = await Promise.all([
    supabase
      .from("savings_transactions")
      .select("source_record_type, source_record_id, amount")
      .eq("user_id", userId)
      .eq("kind", "deposit")
      .not("source_record_type", "is", null)
      .not("source_record_id", "is", null),
    supabase
      .from("budget_transactions")
      .select("source_record_type, source_record_id, amount")
      .eq("user_id", userId)
      .eq("transaction_type", "income")
      .not("source_record_type", "is", null)
      .not("source_record_id", "is", null),
  ]);

  if (savingsRes.error) throw new Error(savingsRes.error.message);
  if (budgetRes.error) throw new Error(budgetRes.error.message);

  for (const row of savingsRes.data ?? []) {
    const type = String(row.source_record_type);
    const id = String(row.source_record_id);
    const amt = Math.abs(Number(row.amount ?? 0));
    if (type === "expense") addToMap(expense, id, amt);
    else if (type === "budget") addToMap(budget, id, amt);
  }

  for (const row of budgetRes.data ?? []) {
    const type = String(row.source_record_type);
    const id = String(row.source_record_id);
    const amt = Math.abs(Number(row.amount ?? 0));
    if (type === "expense") addToMap(expense, id, amt);
    else if (type === "budget") addToMap(budget, id, amt);
  }

  console.info("[reimburse-totals] loaded", {
    userId,
    expenseSources: expense.size,
    budgetSources: budget.size,
  });

  return { expense, budget };
}

export async function assertReimbursementAllowed(
  supabase: SupabaseClient,
  userId: string,
  recordType: "expense" | "budget",
  sourceId: string,
  grossAmount: number,
  reimburseAmount: number,
  totals?: ReimbursementTotalsBySource
): Promise<void> {
  if (!(reimburseAmount > 0)) throw new Error("Valid amount required");

  const maps = totals ?? (await loadReimbursementTotals(supabase, userId));
  const already =
    recordType === "expense"
      ? (maps.expense.get(sourceId) ?? 0)
      : (maps.budget.get(sourceId) ?? 0);

  if (already + reimburseAmount > grossAmount + AMOUNT_EPS) {
    throw new Error("Reimbursement exceeds remaining amount");
  }
}
