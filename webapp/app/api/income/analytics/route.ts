import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { currentYm } from "@/lib/finance/helpers";
import { DEFAULT_ANALYTICS_MONTHS, monthRangeForWindow } from "@/lib/spending/analytics";
import { buildIncomeAnalytics, type LeanDepositRow } from "@/lib/income/analytics";
import { loadIncomeCategories } from "@/lib/income/load";
import { loadAccountsBundle } from "@/lib/savings/load-accounts";
import {
  savingsOccurredAtLowerBound,
  savingsOccurredAtUpperBoundExclusive,
} from "@/lib/transactions/date-range";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

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
  const window = monthRangeForWindow(throughYm, months);

  const started = Date.now();
  const supabase = await createAuthedSupabaseClient();

  const [depositsRes, categories, accountsBundle] = await Promise.all([
    supabase
      .from("savings_transactions")
      .select("amount, occurred_at, income_category_id, account_id")
      .eq("user_id", user.id)
      .eq("kind", "deposit")
      .not("income_category_id", "is", null)
      .gte("occurred_at", savingsOccurredAtLowerBound(window.from))
      .lt("occurred_at", savingsOccurredAtUpperBoundExclusive(window.to)),
    loadIncomeCategories(supabase, user.id),
    loadAccountsBundle(supabase, user.id),
  ]);

  if (depositsRes.error) {
    console.error("[api/income/analytics] deposits load failed", depositsRes.error.message);
    return NextResponse.json({ error: depositsRes.error.message }, { status: 500 });
  }

  const deposits: LeanDepositRow[] = (depositsRes.data ?? []).map((row) => ({
    amount: Number(row.amount ?? 0),
    occurredAt: String(row.occurred_at ?? ""),
    incomeCategoryId: row.income_category_id ? String(row.income_category_id) : null,
    accountId: row.account_id ? String(row.account_id) : null,
  }));

  const analytics = buildIncomeAnalytics({
    throughYm,
    months,
    deposits,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    accounts: accountsBundle.accounts.map((a) => ({ id: a.id, name: a.name })),
  });

  const ms = Date.now() - started;
  console.info("[api/income/analytics] built", {
    userId: user.id,
    months: analytics.months.length,
    depositRows: deposits.length,
    ms,
  });

  return NextResponse.json({ configured: true, analytics });
}
