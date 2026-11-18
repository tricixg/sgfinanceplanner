import type { SupabaseClient } from "@supabase/supabase-js";
import type { BudgetItem } from "@/lib/types";
import { recurringFloorsByBudgetLine, stripSaveBudgetLines } from "@/lib/finance/budget";
import { mapDbBudgetLine, type BudgetLineRow } from "@/lib/expenses/budget-match";
import { budgetLineRowsForMonth, resolveBudgetMonth, type BudgetMonthMap } from "@/lib/budget/monthly";
import { classifyRemovedLines, planBudgetMonthSave } from "@/lib/budget/save-plan";
import { currentYm } from "@/lib/finance/helpers";
import { loadFinanceProfile } from "@/lib/profile/load";
import { loadRecurringInvestments, loadRecurringSubscriptions } from "@/lib/recurring/load";

export type BudgetData = {
  catalog: BudgetLineRow[];
  months: BudgetMonthMap;
  /** Gross monthly salary recorded per saved month (months with none recorded are omitted). */
  income: Record<string, number>;
  /**
   * Catalog line ids in creation order. Drives per-category chart colours: new lines
   * append, and reordering a month's lines doesn't reshuffle colours.
   */
  categoryOrder: string[];
};

/** Catalog (ids, names, types) plus every configured month snapshot. */
export async function loadBudgetData(
  supabase: SupabaseClient,
  userId: string
): Promise<BudgetData> {
  const [linesRes, monthsRes, lineMonthsRes] = await Promise.all([
    supabase
      .from("budget_lines")
      .select("id, category, line_type, sort_order, created_at")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    supabase.from("budget_months").select("month, monthly_salary").eq("user_id", userId),
    supabase
      .from("budget_line_months")
      .select("budget_line_id, month, amount, sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
  ]);
  if (linesRes.error) throw new Error(linesRes.error.message);
  if (monthsRes.error) throw new Error(monthsRes.error.message);
  if (lineMonthsRes.error) throw new Error(lineMonthsRes.error.message);

  const catalog: BudgetLineRow[] = (linesRes.data ?? []).map((row) => ({
    ...mapDbBudgetLine({ ...row, amount: 0 }),
    amount: 0,
  }));
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const months: BudgetMonthMap = {};
  const income: Record<string, number> = {};
  for (const m of monthsRes.data ?? []) {
    months[String(m.month)] = [];
    if (m.monthly_salary != null) income[String(m.month)] = Number(m.monthly_salary);
  }
  for (const r of lineMonthsRes.data ?? []) {
    const month = String(r.month);
    const line = byId.get(String(r.budget_line_id));
    if (!line || line.lineType === "save" || !months[month]) continue;
    months[month].push({
      id: line.id,
      cat: line.category,
      amt: Number(r.amount ?? 0),
      type: line.lineType,
    });
  }
  const categoryOrder = (linesRes.data ?? [])
    .map((row) => ({ id: String(row.id), created: String(row.created_at ?? "") }))
    .sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id))
    .map((row) => row.id);
  return { catalog, months, income, categoryOrder };
}

export async function loadBudgetMonths(
  supabase: SupabaseClient,
  userId: string
): Promise<BudgetMonthMap> {
  return (await loadBudgetData(supabase, userId)).months;
}

export async function loadBudgetCatalog(
  supabase: SupabaseClient,
  userId: string
): Promise<BudgetLineRow[]> {
  return (await loadBudgetData(supabase, userId)).catalog;
}

export async function loadBudgetLines(
  supabase: SupabaseClient,
  userId: string,
  ym: string = currentYm()
): Promise<BudgetItem[]> {
  return resolveBudgetMonth(await loadBudgetMonths(supabase, userId), ym).lines;
}

export async function loadBudgetLineRowsForMonth(
  supabase: SupabaseClient,
  userId: string,
  ym: string
): Promise<BudgetLineRow[]> {
  const { catalog, months } = await loadBudgetData(supabase, userId);
  return budgetLineRowsForMonth(catalog, months, ym);
}

/**
 * After a budget line is renamed, carry the new name onto the expenses linked
 * to it, so their category text (what the transactions list filters by) still
 * matches the line they are counted under.
 */
async function renameLinkedExpenses(
  supabase: SupabaseClient,
  userId: string,
  budgetLineId: string,
  category: string
): Promise<void> {
  const { error, count } = await supabase
    .from("expenses")
    .update({ category, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("user_id", userId)
    .eq("budget_line_id", budgetLineId);
  if (error) {
    console.error("[budget] rename linked expenses failed", { budgetLineId, error: error.message });
    return;
  }
  console.info("[budget] renamed linked expenses", { budgetLineId, count });
}

function check(error: { message: string } | null, step: string): void {
  if (error) throw new Error(`${step}: ${error.message}`);
}

/** Save one month's snapshot. Touches only that month; returns all snapshots. */
export async function saveBudgetMonth(
  supabase: SupabaseClient,
  userId: string,
  ym: string,
  incoming: BudgetItem[]
): Promise<{ months: BudgetMonthMap; income: Record<string, number>; categoryOrder: string[] }> {
  const [{ catalog, months }, subscriptions, investments, profile] = await Promise.all([
    loadBudgetData(supabase, userId),
    loadRecurringSubscriptions(supabase, userId),
    loadRecurringInvestments(supabase, userId),
    loadFinanceProfile(supabase, userId),
  ]);
  const floors = recurringFloorsByBudgetLine([...subscriptions, ...investments], ym);
  const plan = planBudgetMonthSave({ ym, incoming, catalog, months, floors });
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const now = new Date().toISOString();

  // Additive steps first.
  const savedIds: string[] = [];
  const savedLines: BudgetItem[] = [];
  const lineMonthRows: Record<string, unknown>[] = [];
  for (const l of plan.lines) {
    let id = l.matchId;
    if (id) {
      const { error } = await supabase
        .from("budget_lines")
        .update({ category: l.category, line_type: l.lineType, sort_order: l.sortOrder, updated_at: now })
        .eq("id", id)
        .eq("user_id", userId);
      check(error, "update budget line");
      if (catalogById.get(id)?.category !== l.category) {
        await renameLinkedExpenses(supabase, userId, id, l.category);
      }
    } else {
      const { data, error } = await supabase
        .from("budget_lines")
        .insert({ user_id: userId, category: l.category, line_type: l.lineType, sort_order: l.sortOrder })
        .select("id")
        .single();
      check(error, "insert budget line");
      id = String(data?.id);
    }
    savedIds.push(id);
    savedLines.push({ id, cat: l.category, amt: l.amount, type: l.lineType });
    lineMonthRows.push({
      user_id: userId,
      budget_line_id: id,
      month: ym,
      amount: l.amount,
      sort_order: l.sortOrder,
      updated_at: now,
    });
  }

  const { error: monthErr } = await supabase
    .from("budget_months")
    .upsert(
      {
        user_id: userId,
        month: ym,
        // Snapshot of income as it stands when this month is saved.
        monthly_salary: Math.max(0, Math.round((profile.monthlySal || 0) * 100) / 100),
        updated_at: now,
      },
      { onConflict: "user_id,month" }
    );
  check(monthErr, "upsert budget month");

  if (lineMonthRows.length) {
    const { error } = await supabase
      .from("budget_line_months")
      .upsert(lineMonthRows, { onConflict: "budget_line_id,month" });
    check(error, "upsert budget line months");
  }

  // Destructive steps.
  const { data: existingRows, error: selErr } = await supabase
    .from("budget_line_months")
    .select("id, budget_line_id")
    .eq("user_id", userId)
    .eq("month", ym);
  check(selErr, "select budget line months");
  const keep = new Set(savedIds);
  const staleRowIds = (existingRows ?? [])
    .filter((r) => !keep.has(String(r.budget_line_id)))
    .map((r) => r.id);
  if (staleRowIds.length) {
    const { error } = await supabase.from("budget_line_months").delete().in("id", staleRowIds);
    check(error, "delete stale budget line months");
  }

  const monthsAfter: BudgetMonthMap = { ...months, [ym]: savedLines };
  const { hardDelete, unlinkRecurring } = classifyRemovedLines({
    removedIds: plan.removedIds,
    monthsAfter,
    currentYm: currentYm(),
  });
  if (hardDelete.length) {
    const { error } = await supabase
      .from("budget_lines")
      .delete()
      .eq("user_id", userId)
      .in("id", hardDelete);
    check(error, "delete budget lines");
  }
  if (unlinkRecurring.length) {
    for (const table of ["recurring_subscriptions", "recurring_investments"]) {
      const { error } = await supabase
        .from(table)
        .update({ budget_line_id: null })
        .eq("user_id", userId)
        .in("budget_line_id", unlinkRecurring);
      check(error, `unlink ${table}`);
    }
  }

  console.info("[budget] saved month", { userId, ym, count: plan.lines.length });
  const fresh = await loadBudgetData(supabase, userId);
  return { months: fresh.months, income: fresh.income, categoryOrder: fresh.categoryOrder };
}

/** Save the current month's budget (used by the legacy migration). */
export async function saveBudgetLines(
  supabase: SupabaseClient,
  userId: string,
  incoming: BudgetItem[]
): Promise<BudgetItem[]> {
  const ym = currentYm();
  const { months } = await saveBudgetMonth(supabase, userId, ym, incoming);
  return resolveBudgetMonth(months, ym).lines;
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
