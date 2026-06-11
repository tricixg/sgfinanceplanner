import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { mapDbBudgetLine } from "@/lib/expenses/budget-match";
import { currentYm } from "@/lib/finance/helpers";
import { loadCreditCards } from "@/lib/credit-cards/load";
import {
  buildSpendingAnalytics,
  DEFAULT_ANALYTICS_MONTHS,
  monthRangeForWindow,
} from "@/lib/spending/analytics";
import type {
  LeanExpenseRow,
  LeanImportRow,
  SpendingScope,
} from "@/lib/spending/bucket-spend";
import type { AutoCategory } from "@/lib/expenses/auto-category-ids";
import { loadReimbursementTotals } from "@/lib/transactions/reimburse-totals";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

function parseScope(value: string | null): SpendingScope {
  return value === "all" ? "all" : "discretionary";
}

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { searchParams } = new URL(req.url);
  const throughYm = searchParams.get("throughYm") ?? currentYm();
  if (!/^\d{4}-\d{2}$/.test(throughYm)) {
    return NextResponse.json({ error: "Invalid throughYm (use YYYY-MM)" }, { status: 400 });
  }

  const monthsParam = Number(searchParams.get("months") ?? DEFAULT_ANALYTICS_MONTHS);
  const months = Number.isFinite(monthsParam)
    ? Math.max(1, Math.min(24, Math.floor(monthsParam)))
    : DEFAULT_ANALYTICS_MONTHS;
  const scope = parseScope(searchParams.get("scope"));
  const window = monthRangeForWindow(throughYm, months);

  const started = Date.now();
  const supabase = await createAuthedSupabaseClient();

  const [budgetRes, expensesRes, importsRes, cards, reimbursements] = await Promise.all([
    supabase
      .from("budget_lines")
      .select("id, category, amount, line_type, sort_order")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("expenses")
      .select(
        "id, amount, spent_at, category, budget_line_id, financial_account_id, auto_category"
      )
      .eq("user_id", user.id)
      .gte("spent_at", window.from)
      .lte("spent_at", window.to),
    supabase
      .from("budget_transactions")
      .select(
        "id, amount, spent_at, category, transaction_type, financial_account_id"
      )
      .eq("user_id", user.id)
      .is("expense_id", null)
      .neq("transaction_type", "income")
      .gte("spent_at", window.from)
      .lte("spent_at", window.to),
    loadCreditCards(supabase, user.id),
    loadReimbursementTotals(supabase, user.id),
  ]);

  if (budgetRes.error) {
    console.error("[api/spending/analytics] budget load failed", budgetRes.error.message);
    return NextResponse.json({ error: budgetRes.error.message }, { status: 500 });
  }
  if (expensesRes.error) {
    console.error("[api/spending/analytics] expenses load failed", expensesRes.error.message);
    return NextResponse.json({ error: expensesRes.error.message }, { status: 500 });
  }
  if (importsRes.error) {
    console.error("[api/spending/analytics] imports load failed", importsRes.error.message);
    return NextResponse.json({ error: importsRes.error.message }, { status: 500 });
  }

  const budgetLines = (budgetRes.data ?? []).map((r) => mapDbBudgetLine(r));
  const expenses: LeanExpenseRow[] = (expensesRes.data ?? []).map((row) => ({
    id: String(row.id),
    amount: Number(row.amount ?? 0),
    spentAt: String(row.spent_at ?? "").slice(0, 10),
    category: String(row.category ?? ""),
    budgetLineId: row.budget_line_id ? String(row.budget_line_id) : null,
    financialAccountId: row.financial_account_id
      ? String(row.financial_account_id)
      : null,
    autoCategory: (row.auto_category as AutoCategory | null) ?? null,
  }));
  const imports: LeanImportRow[] = (importsRes.data ?? []).map((row) => ({
    id: String(row.id),
    amount: Number(row.amount ?? 0),
    spentAt: String(row.spent_at ?? "").slice(0, 10),
    category: String(row.category ?? ""),
    transactionType: String(row.transaction_type ?? "expense"),
    financialAccountId: row.financial_account_id
      ? String(row.financial_account_id)
      : null,
  }));

  const analytics = buildSpendingAnalytics({
    throughYm,
    months,
    scope,
    budgetLines,
    expenses,
    imports,
    reimbursements,
    cards: cards.map((c) => ({
      financialAccountId: c.financialAccountId,
      name: c.name,
    })),
  });

  const ms = Date.now() - started;
  console.info("[api/spending/analytics] built", {
    userId: user.id,
    months: analytics.months.length,
    scope,
    expenseRows: expenses.length,
    importRows: imports.length,
    ms,
  });

  return NextResponse.json({ configured: true, analytics });
}
