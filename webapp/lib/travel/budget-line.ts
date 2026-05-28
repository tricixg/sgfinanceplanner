import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCategoryKey } from "@/lib/expenses/budget-match";
import type { BudgetItem } from "@/lib/types";

export const TRAVEL_BUDGET_CATEGORY = "Travel";

export function hasTravelBudgetLine(lines: BudgetItem[]): boolean {
  return lines.some(
    (line) =>
      line.type === "spend" &&
      normalizeCategoryKey(line.cat) === normalizeCategoryKey(TRAVEL_BUDGET_CATEGORY)
  );
}

export function appendTravelBudgetLine(lines: BudgetItem[]): BudgetItem[] {
  if (hasTravelBudgetLine(lines)) return lines;
  return [
    ...lines,
    {
      cat: TRAVEL_BUDGET_CATEGORY,
      amt: 0,
      type: "spend",
    },
  ];
}

export async function ensureTravelBudgetLine(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: existing, error } = await supabase
    .from("budget_lines")
    .select("id, category, line_type, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const hasTravel = (existing ?? []).some(
    (row) =>
      row.line_type === "spend" &&
      normalizeCategoryKey(String(row.category ?? "")) ===
        normalizeCategoryKey(TRAVEL_BUDGET_CATEGORY)
  );
  if (hasTravel) return;

  const maxSort = (existing ?? []).reduce(
    (max, row) => Math.max(max, Number(row.sort_order ?? 0)),
    -1
  );
  const { error: insErr } = await supabase.from("budget_lines").insert({
    user_id: userId,
    category: TRAVEL_BUDGET_CATEGORY,
    amount: 0,
    line_type: "spend",
    sort_order: maxSort + 1,
  });
  if (insErr) throw new Error(insErr.message);
}
