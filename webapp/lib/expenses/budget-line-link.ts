import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapDbBudgetLine,
  normalizeCategoryKey,
  resolveBudgetLineId,
  type BudgetLineRow,
} from "@/lib/expenses/budget-match";

/**
 * New `budget_line_id` for an expense whose category text is being edited.
 *
 * Spending analytics bucket an expense by its budget line first and its text
 * second, while the transactions list filters by text — so the two must move
 * together. Returns `undefined` when the text isn't really changing (keep the
 * current link, which may point at a since-renamed line), otherwise the line
 * that now matches the text, or `null` when no budget line does.
 */
export function relinkedBudgetLineId(
  lines: BudgetLineRow[],
  currentCategory: string | null | undefined,
  nextCategory: string
): string | null | undefined {
  if (normalizeCategoryKey(nextCategory) === normalizeCategoryKey(currentCategory ?? "")) {
    return undefined;
  }
  return resolveBudgetLineId(lines, nextCategory, null);
}

/**
 * Patch fields to keep an expense's budget line in step with a category edit:
 * `{ budget_line_id }` when the link must change, `{}` otherwise.
 */
export async function budgetLinePatchForCategoryEdit(
  supabase: SupabaseClient,
  userId: string,
  expenseId: string,
  nextCategory: string
): Promise<{ budget_line_id?: string | null }> {
  const [expenseRes, linesRes] = await Promise.all([
    supabase
      .from("expenses")
      .select("category")
      .eq("id", expenseId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("budget_lines").select("*").eq("user_id", userId),
  ]);
  if (expenseRes.error) throw new Error(expenseRes.error.message);
  if (linesRes.error) throw new Error(linesRes.error.message);
  // Missing row: let the caller's update report "not found".
  if (!expenseRes.data) return {};

  const lines = (linesRes.data ?? []).map((r) => mapDbBudgetLine(r));
  const next = relinkedBudgetLineId(lines, String(expenseRes.data.category ?? ""), nextCategory);
  if (next === undefined) return {};
  console.info("[expenses] budget line relinked on category edit", {
    expenseId,
    budgetLineId: next,
  });
  return { budget_line_id: next };
}
