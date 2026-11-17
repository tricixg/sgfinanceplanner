import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadBudgetMonths, saveBudgetMonth } from "@/lib/budget/load";
import { isBudgetMonthEditable, isYm, resolveBudgetMonth } from "@/lib/budget/monthly";
import { currentYm } from "@/lib/finance/helpers";
import type { BudgetItem } from "@/lib/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

function payload(months: Awaited<ReturnType<typeof loadBudgetMonths>>) {
  const ym = currentYm();
  return {
    configured: true,
    currentYm: ym,
    months,
    budget: resolveBudgetMonth(months, ym).lines,
  };
}

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, currentYm: currentYm(), months: {}, budget: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  try {
    const supabase = await createAuthedSupabaseClient();
    return NextResponse.json(payload(await loadBudgetMonths(supabase, auth.user.id)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load budget";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
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
    const months = await saveBudgetMonth(supabase, auth.user.id, month, body.budget);
    return NextResponse.json(payload(months));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save budget";
    console.error("[api/budget-lines] PUT failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
