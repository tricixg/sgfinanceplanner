import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { buildRecurringRows } from "@/lib/recurring/build-rows";
import {
  loadBnplPlans,
  loadRecurringInvestments,
  loadRecurringSubscriptions,
} from "@/lib/recurring/load";
import { loadIlpPolicies, loadInsurancePolicies } from "@/lib/profile/load";
import { loadLoans } from "@/lib/loans/load";
import { mapExpense } from "@/lib/savings/db-mappers";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { currentYm } from "@/lib/finance/helpers";
import { withRequestId } from "@/lib/api/with-request-id";

export const GET = withRequestId(async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, rows: [] });
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
    loans,
    insurance,
    ilp,
    subscriptions,
    investments,
    bnplPlans,
    expensesRes,
    accountsRes,
    fundsRes,
  ] = await Promise.all([
    loadLoans(supabase, user.id),
    loadInsurancePolicies(supabase, user.id),
    loadIlpPolicies(supabase, user.id),
    loadRecurringSubscriptions(supabase, user.id),
    loadRecurringInvestments(supabase, user.id),
    loadBnplPlans(supabase, user.id),
    supabase
      .from("expenses")
      .select("*")
      .eq("user_id", user.id)
      .gte("spent_at", from)
      .lte("spent_at", to)
      .not("auto_category", "is", null),
    supabase
      .from("financial_accounts")
      .select("id, name")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("investment_funds")
      .select("id, name")
      .eq("user_id", user.id),
  ]);

  if (expensesRes.error) {
    console.error("[api/recurring] expenses load failed", expensesRes.error.message);
    return apiError("api/recurring", expensesRes.error);
  }
  if (accountsRes.error) {
    console.error("[api/recurring] accounts load failed", accountsRes.error.message);
    return apiError("api/recurring", accountsRes.error);
  }
  if (fundsRes.error) {
    console.error("[api/recurring] funds load failed", fundsRes.error.message);
    return apiError("api/recurring", fundsRes.error);
  }

  const expenses = (expensesRes.data ?? []).map((r) => mapExpense(r));
  const accountNames = new Map<string, string>();
  for (const a of accountsRes.data ?? []) {
    accountNames.set(String(a.id), String(a.name ?? ""));
  }
  const fundNames = new Map<string, string>();
  for (const f of fundsRes.data ?? []) {
    fundNames.set(String(f.id), String(f.name ?? ""));
  }

  const rows = buildRecurringRows(
    ym,
    loans,
    insurance,
    ilp,
    subscriptions,
    investments,
    expenses,
    accountNames,
    fundNames,
    bnplPlans
  );

  console.info("[api/recurring] GET", {
    userId: user.id,
    ym,
    rows: rows.length,
    paid: rows.filter((r) => r.paid).length,
  });

  return NextResponse.json({
    configured: true,
    ym,
    rows,
    subscriptions,
    investments,
    bnplPlans,
  });
});
