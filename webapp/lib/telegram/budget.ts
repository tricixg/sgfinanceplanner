import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBudgetExpenseSummary } from "@/lib/expenses/budget-summary";
import { loadReimbursementTotals } from "@/lib/transactions/reimburse-totals";
import { loadBudgetLineRowsForMonth } from "@/lib/budget/load";
import type { CategoryBudgetSummary } from "@/lib/expenses/budget-summary";
import { totalLoanLoadForMonth } from "@/lib/finance/loanLoad";
import { loadLoans } from "@/lib/loans/load";
import { loadOtherLoans } from "@/lib/other-loans/load";
import { loadIlpPolicies, loadInsurancePolicies } from "@/lib/profile/load";
import { mapExpense } from "@/lib/savings/db-mappers";
import { resolveComputedLinesForMonth } from "@/lib/budget/computed-months-load";
import { currentYm } from "@/lib/finance/helpers";

export type MonthBudgetSummary = ReturnType<typeof buildBudgetExpenseSummary>;

export async function loadMonthBudgetSummary(
  supabase: SupabaseClient,
  userId: string,
  ym: string
): Promise<MonthBudgetSummary> {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const from = `${ym}-01`;
  const to = `${ym}-${String(last).padStart(2, "0")}`;

  const [
    budgetLines,
    expensesRes,
    importsRes,
    loans,
    otherLoans,
    insurancePolicies,
    ilpPolicies,
  ] = await Promise.all([
    loadBudgetLineRowsForMonth(supabase, userId, ym),
    supabase
      .from("expenses")
      .select("*")
      .eq("user_id", userId)
      .gte("spent_at", from)
      .lte("spent_at", to),
    supabase
      .from("budget_transactions")
      .select("id, amount, spent_at, category, note, transaction_type")
      .eq("user_id", userId)
      .is("expense_id", null)
      .gte("spent_at", from)
      .lte("spent_at", to)
      .in("transaction_type", ["expense", "subscription", "income"]),
    loadLoans(supabase, userId),
    loadOtherLoans(supabase, userId),
    loadInsurancePolicies(supabase, userId),
    loadIlpPolicies(supabase, userId),
  ]);

  if (expensesRes.error) throw new Error(expensesRes.error.message);
  if (importsRes.error) throw new Error(importsRes.error.message);

  const expenses = (expensesRes.data ?? []).map((r) => mapExpense(r));
  const imports = (importsRes.data ?? []).map((r) => ({
    id: String(r.id),
    amount: Number(r.amount ?? 0),
    spentAt: String(r.spent_at),
    category: String(r.category ?? ""),
    note: String(r.note ?? ""),
    transactionType: String(r.transaction_type ?? "expense"),
  }));

  const computedAlloc = await resolveComputedLinesForMonth(
    supabase,
    userId,
    ym,
    {
      debt: totalLoanLoadForMonth(loans, otherLoans, ym),
      insurance: insurancePolicies.reduce((s, p) => s + p.monthlyPremium, 0),
      ilp: ilpPolicies.reduce((s, p) => s + p.monthlyPremium, 0),
    },
    currentYm()
  );

  const reimbursements = await loadReimbursementTotals(supabase, userId);
  return buildBudgetExpenseSummary(
    ym,
    budgetLines,
    expenses,
    imports,
    computedAlloc,
    reimbursements
  );
}

export function expenseCategoryRows(summary: MonthBudgetSummary): CategoryBudgetSummary[] {
  return [...summary.categories, ...summary.zeroAllocated];
}

export function findCategoryRemaining(
  summary: MonthBudgetSummary,
  budgetLineId: string
): number | null {
  const row = expenseCategoryRows(summary).find((c) => c.budgetLineId === budgetLineId);
  return row ? row.remaining : null;
}
