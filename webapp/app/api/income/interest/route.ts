import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { currentYm } from "@/lib/finance/helpers";
import { monthRangeForWindow } from "@/lib/spending/analytics";
import { buildInterestAnalytics, type LeanDepositRow } from "@/lib/income/analytics";
import { loadIncomeCategories } from "@/lib/income/load";
import { INTEREST_INCOME_SLUG } from "@/lib/income/types";
import { loadAccountsBundle } from "@/lib/savings/load-accounts";
import {
  savingsOccurredAtLowerBound,
  savingsOccurredAtUpperBoundExclusive,
} from "@/lib/transactions/date-range";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { withRequestId } from "@/lib/api/with-request-id";

const DEFAULT_INTEREST_MONTHS = 12;

type InterestDbRow = {
  amount: unknown;
  occurred_at: unknown;
  income_category_id: unknown;
  account_id: unknown;
};

/** Interest earned by cash account per month (Interest-category deposits). */
export const GET = withRequestId(async function GET(req: NextRequest) {
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
  const monthsParam = Number(searchParams.get("months") ?? DEFAULT_INTEREST_MONTHS);
  const months = Number.isFinite(monthsParam)
    ? Math.max(1, Math.min(24, Math.floor(monthsParam)))
    : DEFAULT_INTEREST_MONTHS;
  const window = monthRangeForWindow(throughYm, months);

  const supabase = await createAuthedSupabaseClient();

  try {
    const [categories, accountsBundle] = await Promise.all([
      loadIncomeCategories(supabase, user.id),
      loadAccountsBundle(supabase, user.id),
    ]);
    const interestCategoryId =
      categories.find((c) => c.slug === INTEREST_INCOME_SLUG)?.id ?? null;

    // Paged: PostgREST silently truncates at 1,000 rows (DATA-004).
    const rows = interestCategoryId
      ? await fetchAllRows<InterestDbRow>((from, to) =>
          supabase
            .from("savings_transactions")
            .select("amount, occurred_at, income_category_id, account_id")
            .eq("user_id", user.id)
            .eq("kind", "deposit")
            .eq("income_category_id", interestCategoryId)
            .gte("occurred_at", savingsOccurredAtLowerBound(window.from))
            .lt("occurred_at", savingsOccurredAtUpperBoundExclusive(window.to))
            .order("occurred_at")
            .order("id")
            .range(from, to)
        )
      : [];

    const deposits: LeanDepositRow[] = rows.map((row) => ({
      amount: Number(row.amount ?? 0),
      occurredAt: String(row.occurred_at ?? ""),
      incomeCategoryId: row.income_category_id ? String(row.income_category_id) : null,
      accountId: row.account_id ? String(row.account_id) : null,
    }));

    const interest = buildInterestAnalytics({
      throughYm,
      months,
      deposits,
      accounts: accountsBundle.accounts.map((a) => ({ id: a.id, name: a.name })),
      interestCategoryId,
    });

    console.info("[api/income/interest] built", {
      userId: user.id,
      months: interest.months.length,
      rows: deposits.length,
    });
    return NextResponse.json({ configured: true, interest });
  } catch (e) {
    console.error("[api/income/interest] failed", e instanceof Error ? e.message : e);
    return apiError("api/income/interest", e, { fallback: "Failed to load interest" });
  }
});
