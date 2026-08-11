import type { SupabaseClient } from "@supabase/supabase-js";

function addMonthsYm(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function addAdditiveRowsToMonths(
  result: Record<string, number>,
  rows: Array<{ occurred_at?: unknown; amount?: unknown }>
): Record<string, number> {
  for (const row of rows) {
    const occurred = String(row.occurred_at ?? "");
    const ym = occurred.slice(0, 7);
    if (!(ym in result)) continue;
    const amt = Number(row.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    result[ym] += amt;
  }
  return result;
}

async function loadIncomeByYmForFlag(
  supabase: SupabaseClient,
  userId: string,
  startYm: string,
  count: number,
  flagColumn: "counts_as_additive" | "counts_in_baseline"
): Promise<Record<string, number>> {
  const endYm = addMonthsYm(startYm, count - 1);
  const from = `${startYm}-01`;
  const [ey, em] = endYm.split("-").map(Number);
  const lastDay = new Date(ey, em, 0).getDate();
  const to = `${endYm}-${String(lastDay).padStart(2, "0")}`;

  const { data: categories, error: catErr } = await supabase
    .from("income_categories")
    .select("id")
    .eq("user_id", userId)
    .eq(flagColumn, true);

  if (catErr) throw new Error(catErr.message);

  const categoryIds = (categories ?? []).map((c) => String(c.id));
  const result: Record<string, number> = {};

  for (let i = 0; i < count; i++) {
    result[addMonthsYm(startYm, i)] = 0;
  }

  if (!categoryIds.length) {
    console.info("[income] no categories for flag", { userId, flagColumn });
    return result;
  }

  const { data: rows, error } = await supabase
    .from("savings_transactions")
    .select("amount, occurred_at, income_category_id")
    .eq("user_id", userId)
    .eq("kind", "deposit")
    .in("income_category_id", categoryIds)
    .gte("occurred_at", `${from}T00:00:00`)
    .lte("occurred_at", `${to}T23:59:59`);

  if (error) throw new Error(error.message);

  addAdditiveRowsToMonths(result, rows ?? []);

  console.info("[income] deposits by month", { userId, startYm, count, flagColumn, result });
  return result;
}

export async function loadAdditiveIncomeByYm(
  supabase: SupabaseClient,
  userId: string,
  startYm: string,
  count: number
): Promise<Record<string, number>> {
  return loadIncomeByYmForFlag(supabase, userId, startYm, count, "counts_as_additive");
}

/** Actual salary/comms deposits by month — used to replace the projected baseline for past and current months. */
export async function loadBaselineActualIncomeByYm(
  supabase: SupabaseClient,
  userId: string,
  startYm: string,
  count: number
): Promise<Record<string, number>> {
  return loadIncomeByYmForFlag(supabase, userId, startYm, count, "counts_in_baseline");
}
