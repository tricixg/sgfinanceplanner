import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadBudgetData, saveBudgetMonth } from "@/lib/budget/load";
import { isBudgetMonthEditable, isYm, resolveBudgetMonth, type BudgetMonthMap } from "@/lib/budget/monthly";
import { currentYm } from "@/lib/finance/helpers";
import { loadComputedMonths } from "@/lib/budget/computed-months-load";
import type { ComputedMonthMap } from "@/lib/finance/computed-months";
import type { BudgetItem } from "@/lib/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { withRequestId } from "@/lib/api/with-request-id";

function payload(
  data: { months: BudgetMonthMap; income: Record<string, number>; categoryOrder?: string[] },
  computed: ComputedMonthMap = {}
) {
  const ym = currentYm();
  const { months, income } = data;
  const categoryOrder = data.categoryOrder ?? [];
  return {
    configured: true,
    currentYm: ym,
    months,
    income,
    /** Frozen insurance / ILP / loan figures of finished months. */
    computed,
    budget: resolveBudgetMonth(months, ym).lines,
    /** Catalog line ids in creation order, for consistent category colours. */
    categoryOrder,
  };
}

export const GET = withRequestId(async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, currentYm: currentYm(), months: {}, income: {}, budget: [], categoryOrder: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  try {
    const supabase = await createAuthedSupabaseClient();
    const [data, computed] = await Promise.all([
      loadBudgetData(supabase, auth.user.id),
      loadComputedMonths(supabase, auth.user.id),
    ]);
    return NextResponse.json(payload(data, computed));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load budget";
    return apiError("api/budget-lines", msg, { fallback: "Failed to load budget" });
  }
});

export const PUT = withRequestId(async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  let body: { month?: string; budget?: BudgetItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.budget)) {
    return NextResponse.json({ error: "budget must be an array" }, { status: 400 });
  }
  if (body.budget.length > 200) {
    return NextResponse.json({ error: "Too many budget lines" }, { status: 400 });
  }
  const today = currentYm();
  const month = body.month ?? today;
  if (!isYm(month)) {
    return NextResponse.json({ error: "Invalid month (use YYYY-MM)" }, { status: 400 });
  }
  if (!isBudgetMonthEditable(month, today)) {
    return NextResponse.json(
      { error: "Budgets can only be edited for the current or next month" },
      { status: 400 }
    );
  }
  try {
    const supabase = await createAuthedSupabaseClient();
    console.info("[api/budget-lines] PUT", { userId: auth.user.id, month, count: body.budget.length });
    const saved = await saveBudgetMonth(supabase, auth.user.id, month, body.budget);
    return NextResponse.json(payload(saved));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save budget";
    console.error("[api/budget-lines] PUT failed", msg);
    return apiError("api/budget-lines", msg, { fallback: "Failed to save budget" });
  }
});
