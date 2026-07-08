import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailySpendMap } from "./interest-accrual";

/** In-memory index of card spend by day for fast cycle sums. */
export type CardSpendIndex = {
  sumInRange(cycleStart: string, cycleEnd: string): number;
  dailySpendInRange(from: string, to: string): DailySpendMap;
};

type SpendRow = {
  spent_at: unknown;
  created_at?: unknown;
};

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function resolveSpendDay(row: SpendRow): string | null {
  const spentAt = String(row.spent_at ?? "").slice(0, 10);
  if (isYmd(spentAt)) return spentAt;
  const createdAt = String(row.created_at ?? "").slice(0, 10);
  if (isYmd(createdAt)) return createdAt;
  return null;
}

function indexFromByDay(byDay: DailySpendMap): CardSpendIndex {
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

/** One query per table for all card accounts (used on Credit Cards load). */
export async function buildCardSpendIndexMap(
  supabase: SupabaseClient,
  userId: string,
  financialAccountIds: string[],
  from: string,
  to: string
): Promise<Map<string, CardSpendIndex>> {
  const map = new Map<string, CardSpendIndex>();
  if (financialAccountIds.length === 0) return map;

  const byAccountDay = new Map<string, DailySpendMap>();
  for (const id of financialAccountIds) {
    byAccountDay.set(id, {});
  }

  const { data: expenses, error: expErr } = await supabase
    .from("expenses")
    .select("amount, spent_at, created_at, financial_account_id")
    .eq("user_id", userId)
    .in("financial_account_id", financialAccountIds)
    .gte("spent_at", from)
    .lte("spent_at", to);

  if (expErr) throw new Error(expErr.message);

  for (const row of expenses ?? []) {
    const accountId = String(row.financial_account_id ?? "");
    const day = resolveSpendDay(row);
    if (!day) {
      console.info("[statement-spend-index] skip expense row without date", {
        accountId,
      });
      continue;
    }
    const bucket = byAccountDay.get(accountId);
    if (!bucket) continue;
    bucket[day] = (bucket[day] ?? 0) + Number(row.amount ?? 0);
  }

  const { data: budgetRows, error: budErr } = await supabase
    .from("budget_transactions")
    .select("amount, spent_at, created_at, financial_account_id, transaction_type")
    .eq("user_id", userId)
    .in("financial_account_id", financialAccountIds)
    .is("expense_id", null)
    .gte("spent_at", from)
    .lte("spent_at", to);

  if (budErr) throw new Error(budErr.message);

  for (const row of budgetRows ?? []) {
    const accountId = String(row.financial_account_id ?? "");
    const day = resolveSpendDay(row);
    if (!day) {
      console.info("[statement-spend-index] skip budget row without date", {
        accountId,
      });
      continue;
    }
    const bucket = byAccountDay.get(accountId);
    if (!bucket) continue;
    const signed =
      row.transaction_type === "income"
        ? -Number(row.amount ?? 0)
        : Number(row.amount ?? 0);
    bucket[day] = (bucket[day] ?? 0) + signed;
  }

  for (const [accountId, byDay] of byAccountDay) {
    map.set(accountId, indexFromByDay(byDay));
  }

  console.info("[statement-spend-index] built map", {
    accounts: financialAccountIds.length,
    from,
    to,
  });

  return map;
}

export async function buildCardSpendIndex(
  supabase: SupabaseClient,
  userId: string,
  financialAccountId: string,
  from: string,
  to: string
): Promise<CardSpendIndex> {
  const map = await buildCardSpendIndexMap(
    supabase,
    userId,
    [financialAccountId],
    from,
    to
  );
  return map.get(financialAccountId) ?? indexFromByDay({});
}
