import type { SupabaseClient } from "@supabase/supabase-js";
import { findIncomeCategoryByName, loadIncomeCategories } from "@/lib/income/load";
import { listAllTransactions } from "@/lib/savings/ledger";
import {
  EXCLUDED_FROM_BUDGET_LABEL,
  UNCATEGORIZED_CATEGORY_FILTER,
} from "@/lib/transactions/types";

export type ResolvedSavingsCategoryFilter = {
  /** True when this category can never match a savings row — skip fetching that source. */
  skip: boolean;
  incomeCategoryId?: string;
  categoryBlank?: boolean;
  excludeFromBudget?: boolean;
};

/** Translate a chosen category filter value into savings_transactions query conditions. */
export async function resolveSavingsCategoryFilter(
  supabase: SupabaseClient,
  userId: string,
  category?: string
): Promise<ResolvedSavingsCategoryFilter> {
  if (!category) return { skip: false };
  if (category === UNCATEGORIZED_CATEGORY_FILTER) {
    return { skip: false, categoryBlank: true };
  }
  if (category === EXCLUDED_FROM_BUDGET_LABEL) {
    return { skip: false, excludeFromBudget: true };
  }
  const match = await findIncomeCategoryByName(supabase, userId, category);
  return match ? { skip: false, incomeCategoryId: match.id } : { skip: true };
}

/** Distinct category values usable to filter the unified transaction list, sorted A-Z. */
export async function loadDistinctTransactionCategories(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const [expenseRes, budgetRes, incomeCategories, excludedCheck] = await Promise.all([
    supabase.from("expenses").select("category").eq("user_id", userId).neq("category", ""),
    supabase
      .from("budget_transactions")
      .select("category")
      .eq("user_id", userId)
      .is("expense_id", null)
      .neq("category", ""),
    loadIncomeCategories(supabase, userId),
    listAllTransactions(supabase, { userId, excludeFromBudget: true, limit: 1, offset: 0 }),
  ]);

  if (expenseRes.error) throw new Error(expenseRes.error.message);
  if (budgetRes.error) throw new Error(budgetRes.error.message);

  const categories = new Set<string>();
  for (const row of expenseRes.data ?? []) {
    const value = String(row.category ?? "").trim();
    if (value) categories.add(value);
  }
  for (const row of budgetRes.data ?? []) {
    const value = String(row.category ?? "").trim();
    if (value) categories.add(value);
  }
  for (const c of incomeCategories) {
    const value = c.name.trim();
    if (value) categories.add(value);
  }
  if (excludedCheck.total > 0) categories.add(EXCLUDED_FROM_BUDGET_LABEL);

  return [...categories].sort((a, b) => a.localeCompare(b));
}
