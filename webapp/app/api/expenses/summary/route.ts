import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { buildBudgetExpenseSummary } from "@/lib/expenses/budget-summary";
import { loadBudgetLineRowsForMonth } from "@/lib/budget/load";
import { loadIlpPolicies, loadInsurancePolicies } from "@/lib/profile/load";
import { loadLoans } from "@/lib/loans/load";
import { loadOtherLoans } from "@/lib/other-loans/load";
import { totalLoanLoadForMonth } from "@/lib/finance/loanLoad";
import { mapExpense } from "@/lib/savings/db-mappers";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { resolveComputedLinesForMonth } from "@/lib/budget/computed-months-load";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { currentYm } from "@/lib/finance/helpers";
import { loadReimbursementTotals } from "@/lib/transactions/reimburse-totals";

type ImportDbRow = {
  id: unknown;
  amount: unknown;
  spent_at: unknown;
  category: unknown;
  note: unknown;
  transaction_type: unknown;
};

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
    budgetLines,
    expensesRes,
    importsRes,
    loans,
    otherLoans,
    insurancePolicies,
    ilpPolicies,
    reimbursements,
  ] = await Promise.all([
    loadBudgetLineRowsForMonth(supabase, user.id, ym).catch((e: unknown) => e as Error),
    // Paged: PostgREST silently truncates at 1,000 rows (DATA-004).
    fetchAllRows<Parameters<typeof mapExpense>[0]>((rFrom, rTo) =>
      supabase
        .from("expenses")
        .select("*")
        .eq("user_id", user.id)
        .gte("spent_at", from)
        .lte("spent_at", to)
        .order("spent_at", { ascending: false })
        .order("id", { ascending: false })
        .range(rFrom, rTo)
    ).catch((e: unknown) => e as Error),
    fetchAllRows<ImportDbRow>((rFrom, rTo) =>
      supabase
        .from("budget_transactions")
        .select("id, amount, spent_at, category, note, transaction_type")
        .eq("user_id", user.id)
        .is("expense_id", null)
        .gte("spent_at", from)
        .lte("spent_at", to)
        .in("transaction_type", ["expense", "subscription", "income"])
        .order("spent_at", { ascending: false })
        .order("id", { ascending: false })
        .range(rFrom, rTo)
    ).catch((e: unknown) => e as Error),
    loadLoans(supabase, user.id),
    loadOtherLoans(supabase, user.id),
    loadInsurancePolicies(supabase, user.id),
    loadIlpPolicies(supabase, user.id),
    loadReimbursementTotals(supabase, user.id),
  ]);

  if (budgetLines instanceof Error) {
    console.error("[api/expenses/summary] budget load failed", budgetLines.message);
    return NextResponse.json({ error: budgetLines.message }, { status: 500 });
  }
  if (expensesRes instanceof Error) {
    console.error("[api/expenses/summary] expenses load failed", expensesRes.message);
    return NextResponse.json({ error: expensesRes.message }, { status: 500 });
  }
  if (importsRes instanceof Error) {
    console.error("[api/expenses/summary] imports load failed", importsRes.message);
    return NextResponse.json({ error: importsRes.message }, { status: 500 });
  }

  const expenses = expensesRes.map((r) => mapExpense(r));
  const imports = importsRes.map((r) => ({
    id: String(r.id),
    amount: Number(r.amount ?? 0),
    spentAt: String(r.spent_at),
    category: String(r.category ?? ""),
    note: String(r.note ?? ""),
    transactionType: String(r.transaction_type ?? "expense"),
  }));

  // A finished month uses its frozen insurance / ILP / loan figures when it has them.
  const computedAlloc = await resolveComputedLinesForMonth(
    supabase,
    user.id,
    ym,
    {
      debt: totalLoanLoadForMonth(loans, otherLoans, ym),
      insurance: insurancePolicies.reduce((s, p) => s + p.monthlyPremium, 0),
      ilp: ilpPolicies.reduce((s, p) => s + p.monthlyPremium, 0),
    },
    currentYm()
  );

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
