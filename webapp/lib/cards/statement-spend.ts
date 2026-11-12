import type { SupabaseClient } from "@supabase/supabase-js";
import { eachDayYmd } from "./interest-accrual";
import type { DailySpendMap } from "./interest-accrual";
import { loadStatementCreditedBudgetTransactionIds } from "./statement-spend-index";

export function sumAmounts(rows: { amount: number }[]): number {
  return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

/** Sum card spend in [cycleStart, cycleEnd] without double-counting expenses linked to budget rows. */
export async function sumCardSpendInCycle(
  supabase: SupabaseClient,
  userId: string,
  financialAccountId: string,
  cycleStart: string,
  cycleEnd: string
): Promise<number> {
  const byDay = await sumCardSpendByDay(
    supabase,
    userId,
    financialAccountId,
    cycleStart,
    cycleEnd
  );
  return Object.values(byDay).reduce((s, v) => s + v, 0);
}

export async function sumCardSpendByDay(
  supabase: SupabaseClient,
  userId: string,
  financialAccountId: string,
  from: string,
  to: string
): Promise<DailySpendMap> {
  const map: DailySpendMap = {};
  for (const day of eachDayYmd(from, to)) {
    map[day] = 0;
  }

  const { data: expenses, error: expErr } = await supabase
    .from("expenses")
    .select("amount, spent_at")
    .eq("user_id", userId)
    .eq("financial_account_id", financialAccountId)
    .gte("spent_at", from)
    .lte("spent_at", to);

  if (expErr) throw new Error(expErr.message);

  for (const row of expenses ?? []) {
    const day = String(row.spent_at).slice(0, 10);
    map[day] = (map[day] ?? 0) + Number(row.amount ?? 0);
  }

  const { data: budgetRows, error: budErr } = await supabase
    .from("budget_transactions")
    .select("id, amount, spent_at, transaction_type")
    .eq("user_id", userId)
    .eq("financial_account_id", financialAccountId)
    .is("expense_id", null)
    .gte("spent_at", from)
    .lte("spent_at", to);

  if (budErr) throw new Error(budErr.message);

  // Excluded for the same reason as buildCardSpendIndexMap: already captured via the
  // credited statement's amount_paid, not spend/anti-spend in any billing cycle.
  const excludedIds = await loadStatementCreditedBudgetTransactionIds(supabase, userId);

  for (const row of budgetRows ?? []) {
    if (excludedIds.has(String(row.id))) continue;
    const day = String(row.spent_at).slice(0, 10);
    const signed =
      row.transaction_type === "income"
        ? -Number(row.amount ?? 0)
        : Number(row.amount ?? 0);
    map[day] = (map[day] ?? 0) + signed;
  }

  console.info("[statement-spend] summed by day", {
    financialAccountId,
    from,
    to,
    total: Object.values(map).reduce((s, v) => s + v, 0),
  });

  return map;
}
