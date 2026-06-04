import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { buildBudgetExpenseSummary } from "@/lib/expenses/budget-summary";
import { mapDbBudgetLine } from "@/lib/expenses/budget-match";
import { loadIlpPolicies, loadInsurancePolicies } from "@/lib/profile/load";
import { loadLoans } from "@/lib/loans/load";
import { loadRecurringSubscriptions } from "@/lib/recurring/load";
import { computedSubscriptionMonthly } from "@/lib/finance/budget";
import { loanLoadForMonth } from "@/lib/finance/loanLoad";
import { mapExpense } from "@/lib/savings/db-mappers";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { currentYm } from "@/lib/finance/helpers";
import { loadReimbursementTotals } from "@/lib/transactions/reimburse-totals";

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { searchParams } = new URL(req.url);
  const ym = searchParams.get("ym") ?? currentYm();
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    return NextResponse.json({ error: "Invalid ym (use YYYY-MM)" }, { status: 400 });
  }

  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const from = `${ym}-01`;
  const to = `${ym}-${String(last).padStart(2, "0")}`;

  const supabase = await createAuthedSupabaseClient();

  const [
    budgetRes,
    expensesRes,
    importsRes,
    loans,
    insurancePolicies,
    ilpPolicies,
    subscriptions,
    reimbursements,
  ] = await Promise.all([
    supabase
      .from("budget_lines")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("expenses")
      .select("*")
      .eq("user_id", user.id)
      .gte("spent_at", from)
      .lte("spent_at", to)
      .order("spent_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("budget_transactions")
      .select("id, amount, spent_at, category, note, transaction_type")
      .eq("user_id", user.id)
      .is("expense_id", null)
      .gte("spent_at", from)
      .lte("spent_at", to)
      .in("transaction_type", ["expense", "subscription", "income"])
      .order("spent_at", { ascending: false }),
    loadLoans(supabase, user.id),
    loadInsurancePolicies(supabase, user.id),
    loadIlpPolicies(supabase, user.id),
    loadRecurringSubscriptions(supabase, user.id),
    loadReimbursementTotals(supabase, user.id),
  ]);

  if (budgetRes.error) {
    console.error("[api/expenses/summary] budget load failed", budgetRes.error.message);
    return NextResponse.json({ error: budgetRes.error.message }, { status: 500 });
  }
  if (expensesRes.error) {
    console.error("[api/expenses/summary] expenses load failed", expensesRes.error.message);
    return NextResponse.json({ error: expensesRes.error.message }, { status: 500 });
  }
  if (importsRes.error) {
    console.error("[api/expenses/summary] imports load failed", importsRes.error.message);
    return NextResponse.json({ error: importsRes.error.message }, { status: 500 });
  }

  const budgetLines = (budgetRes.data ?? []).map((r) => mapDbBudgetLine(r));
  const expenses = (expensesRes.data ?? []).map((r) => mapExpense(r));
  const imports = (importsRes.data ?? []).map((r) => ({
    id: String(r.id),
    amount: Number(r.amount ?? 0),
    spentAt: String(r.spent_at),
    category: String(r.category ?? ""),
    note: String(r.note ?? ""),
    transactionType: String(r.transaction_type ?? "expense"),
  }));

  const computedAlloc = {
    debt: loanLoadForMonth(loans, ym),
    insurance: insurancePolicies.reduce((s, p) => s + p.monthlyPremium, 0),
    ilp: ilpPolicies.reduce((s, p) => s + p.monthlyPremium, 0),
    subscription: computedSubscriptionMonthly(subscriptions),
  };

  const summary = buildBudgetExpenseSummary(
    ym,
    budgetLines,
    expenses,
    imports,
    computedAlloc,
    reimbursements
  );

  console.info("[api/expenses/summary] GET", {
    userId: user.id,
    ym,
    expenseCount: expenses.length,
    importCount: imports.length,
    categories: summary.categories.length,
    zeroAllocated: summary.zeroAllocated.length,
    computed: summary.computedCategories.map((c) => ({
      kind: c.autoCategory,
      spent: c.spent,
    })),
    uncategorizedSpent: summary.uncategorized.spent,
  });

  return NextResponse.json({ configured: true, ...summary });
}
