import type { SupabaseClient } from "@supabase/supabase-js";
import type { BudgetItem } from "@/lib/types";
import { stripSaveBudgetLines } from "@/lib/finance/budget";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function loadBudgetLines(
  supabase: SupabaseClient,
  userId: string
): Promise<BudgetItem[]> {
  const { data, error } = await supabase
    .from("budget_lines")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    cat: String(row.category ?? ""),
    amt: Number(row.amount ?? 0),
    type: (row.line_type ?? "fixed") as BudgetItem["type"],
  }));
}

export async function saveBudgetLines(
  supabase: SupabaseClient,
  userId: string,
  incoming: BudgetItem[]
): Promise<BudgetItem[]> {
  const lines = stripSaveBudgetLines(incoming);
  const { data: existing } = await supabase
    .from("budget_lines")
    .select("id, category, line_type")
    .eq("user_id", userId);

  const keepIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const b = lines[i];
    const payload = {
      user_id: userId,
      category: b.cat ?? "",
      amount: b.amt ?? 0,
      line_type: b.type ?? "fixed",
      sort_order: i,
      updated_at: new Date().toISOString(),
    };

    const matchById =
      b.id && UUID_RE.test(b.id)
        ? (existing ?? []).find((e) => String(e.id) === b.id && !keepIds.has(String(e.id)))
        : undefined;
    const match =
      matchById ??
      (existing ?? []).find(
        (e) =>
          e.category === b.cat &&
          e.line_type === b.type &&
          !keepIds.has(String(e.id))
      );
    if (match?.id && UUID_RE.test(String(match.id))) {
      keepIds.add(String(match.id));
      await supabase.from("budget_lines").update(payload).eq("id", match.id);
    } else {
      const { data: ins } = await supabase
        .from("budget_lines")
        .insert(payload)
        .select("id")
        .single();
      if (ins?.id) keepIds.add(String(ins.id));
    }
  }

  for (const row of existing ?? []) {
    if (!keepIds.has(String(row.id))) {
      await supabase.from("budget_lines").delete().eq("id", row.id);
    }
  }

  console.info("[budget] saved", { userId, count: lines.length });
  return loadBudgetLines(supabase, userId);
}

export async function migrateBudgetFromDashboard(
  supabase: SupabaseClient,
  userId: string,
  budget: BudgetItem[]
): Promise<void> {
  const { count } = await supabase
    .from("budget_lines")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) > 0) return;
  const lines = stripSaveBudgetLines(budget ?? []);
  if (!lines.length) return;
  await saveBudgetLines(supabase, userId, lines);
  console.info("[migrate] budget lines", { userId, count: lines.length });
}
