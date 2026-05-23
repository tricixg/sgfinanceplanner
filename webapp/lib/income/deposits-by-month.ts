import type { SupabaseClient } from "@supabase/supabase-js";

function addMonthsYm(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export async function loadAdditiveIncomeByYm(
  supabase: SupabaseClient,
  userId: string,
  startYm: string,
  count: number
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
    .eq("counts_as_additive", true);

  if (catErr) throw new Error(catErr.message);

  const additiveIds = (categories ?? []).map((c) => String(c.id));
  const result: Record<string, number> = {};

  for (let i = 0; i < count; i++) {
    result[addMonthsYm(startYm, i)] = 0;
  }

  if (!additiveIds.length) {
    console.info("[income] no additive categories", { userId });
    return result;
  }

  const { data: rows, error } = await supabase
    .from("savings_transactions")
    .select("amount, occurred_at, income_category_id")
    .eq("user_id", userId)
    .eq("kind", "deposit")
    .in("income_category_id", additiveIds)
    .gte("occurred_at", `${from}T00:00:00`)
    .lte("occurred_at", `${to}T23:59:59`);

  if (error) throw new Error(error.message);

  for (const row of rows ?? []) {
    const occurred = String(row.occurred_at ?? "");
    const ym = occurred.slice(0, 7);
    if (!result[ym]) continue;
    const amt = Number(row.amount ?? 0);
    result[ym] += Math.abs(amt);
  }

  console.info("[income] additive deposits by month", { userId, startYm, count, result });
  return result;
}
