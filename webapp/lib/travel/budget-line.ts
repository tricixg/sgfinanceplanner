import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCategoryKey } from "@/lib/expenses/budget-match";
import type { BudgetItem } from "@/lib/types";
import { loadBudgetData } from "@/lib/budget/load";
import { resolveBudgetMonth } from "@/lib/budget/monthly";
import { currentYm } from "@/lib/finance/helpers";

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
  const { catalog, months } = await loadBudgetData(supabase, userId);
  const travelKey = normalizeCategoryKey(TRAVEL_BUDGET_CATEGORY);

  let travelId = catalog.find(
    (row) => row.lineType === "spend" && normalizeCategoryKey(row.category) === travelKey
  )?.id;

  if (!travelId) {
    const maxSort = catalog.reduce((max, row) => Math.max(max, row.sortOrder), -1);
    const { data, error: insErr } = await supabase
      .from("budget_lines")
      .insert({
        user_id: userId,
        category: TRAVEL_BUDGET_CATEGORY,
        line_type: "spend",
        sort_order: maxSort + 1,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    travelId = String(data.id);
  }

  const { sourceYm } = resolveBudgetMonth(months, currentYm());
  if (!sourceYm) return;

  const rows = Object.keys(months)
    .filter((ym) => ym >= sourceYm && !months[ym].some((l) => l.id === travelId))
    .map((ym) => ({
      user_id: userId,
      budget_line_id: travelId,
      month: ym,
      amount: 0,
      sort_order: months[ym].length,
    }));
  if (!rows.length) return;
  const { error } = await supabase
    .from("budget_line_months")
    .upsert(rows, { onConflict: "budget_line_id,month", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}
