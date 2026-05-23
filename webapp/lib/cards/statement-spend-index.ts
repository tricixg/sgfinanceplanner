import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailySpendMap } from "./interest-accrual";

/** In-memory index of card spend by day for fast cycle sums. */
export type CardSpendIndex = {
  sumInRange(cycleStart: string, cycleEnd: string): number;
  dailySpendInRange(from: string, to: string): DailySpendMap;
};

export async function buildCardSpendIndex(
  supabase: SupabaseClient,
  userId: string,
  financialAccountId: string,
  from: string,
  to: string
): Promise<CardSpendIndex> {
  const byDay: DailySpendMap = {};

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
    byDay[day] = (byDay[day] ?? 0) + Number(row.amount ?? 0);
  }

  const { data: budgetRows, error: budErr } = await supabase
    .from("budget_transactions")
    .select("amount, spent_at")
    .eq("user_id", userId)
    .eq("financial_account_id", financialAccountId)
    .is("expense_id", null)
    .neq("transaction_type", "income")
    .gte("spent_at", from)
    .lte("spent_at", to);

  if (budErr) throw new Error(budErr.message);

  for (const row of budgetRows ?? []) {
    const day = String(row.spent_at).slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + Number(row.amount ?? 0);
  }

  console.info("[statement-spend-index] built", {
    financialAccountId,
    from,
    to,
    days: Object.keys(byDay).length,
  });

  return {
    sumInRange(cycleStart, cycleEnd) {
      let total = 0;
      for (const [day, amt] of Object.entries(byDay)) {
        if (day >= cycleStart && day <= cycleEnd) total += amt;
      }
      return total;
    },
    dailySpendInRange(fromDay, toDay) {
      const out: DailySpendMap = {};
      for (const [day, amt] of Object.entries(byDay)) {
        if (day >= fromDay && day <= toDay) out[day] = amt;
      }
      return out;
    },
  };
}
