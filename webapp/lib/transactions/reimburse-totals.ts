import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export type ReimbursementTotalsBySource = {
  expense: Map<string, number>;
  budget: Map<string, number>;
};

const AMOUNT_EPS = 0.001;

export function netBudgetSpend(gross: number, reimbursed: number): number {
  const net = Math.round((gross - reimbursed) * 100) / 100;
  return net <= AMOUNT_EPS ? 0 : Math.max(0, net);
}

export type ReimbursementStatus = "none" | "partial" | "full";

export function reimbursementStatus(amount: number, reimbursed: number): ReimbursementStatus {
  if (reimbursed <= AMOUNT_EPS) return "none";
  if (reimbursed >= amount - AMOUNT_EPS) return "full";
  return "partial";
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

  type SourceRow = {
    source_record_type: unknown;
    source_record_id: unknown;
    amount: unknown;
  };
  // Paged: PostgREST silently truncates at 1,000 rows (DATA-004).
  const [savingsRows, budgetRows] = await Promise.all([
    fetchAllRows<SourceRow>((from, to) =>
      supabase
        .from("savings_transactions")
        .select("source_record_type, source_record_id, amount")
        .eq("user_id", userId)
        .eq("kind", "deposit")
        .not("source_record_type", "is", null)
        .not("source_record_id", "is", null)
        .order("occurred_at")
        .order("id")
        .range(from, to)
    ),
    fetchAllRows<SourceRow>((from, to) =>
      supabase
        .from("budget_transactions")
        .select("source_record_type, source_record_id, amount")
        .eq("user_id", userId)
        .eq("transaction_type", "income")
        .not("source_record_type", "is", null)
        .not("source_record_id", "is", null)
        .order("spent_at")
        .order("id")
        .range(from, to)
    ),
  ]);

  for (const row of savingsRows) {
    const type = String(row.source_record_type);
    const id = String(row.source_record_id);
    const amt = Math.abs(Number(row.amount ?? 0));
    if (type === "expense") addToMap(expense, id, amt);
    else if (type === "budget") addToMap(budget, id, amt);
  }

  for (const row of budgetRows) {
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
