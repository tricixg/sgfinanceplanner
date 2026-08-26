import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import type { SavingsTransactionKind } from "@/lib/savings/types";
import type { BudgetTransactionType } from "@/lib/transactions/types";
import { parseDateRangeFilter } from "@/lib/transactions/date-range";
import { listUnifiedTransactions } from "@/lib/transactions/unified";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

const SAVINGS_KINDS: SavingsTransactionKind[] = ["deposit", "withdrawal", "adjustment"];
const BUDGET_TYPES: BudgetTransactionType[] = ["expense", "subscription", "income"];

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [], total: 0, nextOffset: null });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(
    50,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20)
  );
  const accountId = searchParams.get("accountId")?.trim() || undefined;
  const poolId = searchParams.get("poolId")?.trim() || undefined;
  const financialAccountId = searchParams.get("financialAccountId")?.trim() || undefined;
  const kindParam = searchParams.get("kind")?.trim();
  const kind =
    kindParam && SAVINGS_KINDS.includes(kindParam as SavingsTransactionKind)
      ? (kindParam as SavingsTransactionKind)
      : undefined;
  const txTypeParam = searchParams.get("transactionType")?.trim();
  const transactionType =
    txTypeParam && BUDGET_TYPES.includes(txTypeParam as BudgetTransactionType)
      ? (txTypeParam as BudgetTransactionType)
      : undefined;
  const sourceParam = searchParams.get("source")?.trim();
  const source =
    sourceParam === "savings" || sourceParam === "budget" ? sourceParam : "all";
  const category = searchParams.get("category")?.trim() || undefined;

  const dateRange = parseDateRangeFilter(
    searchParams.get("dateFrom"),
    searchParams.get("dateTo")
  );
  if ("error" in dateRange) {
    console.warn("[api/transactions] invalid date range", dateRange.error);
    return NextResponse.json({ error: dateRange.error }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();

  if (accountId) {
    const { data: acct } = await supabase
      .from("user_savings_accounts")
      .select("user_id")
      .eq("id", accountId)
      .maybeSingle();
    if (!acct || acct.user_id !== auth.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  if (poolId) {
    const householdId = await ensureUserHousehold(supabase, auth.user.id);
    const { data: pool } = await supabase
      .from("savings_pools")
      .select("household_id")
      .eq("id", poolId)
      .maybeSingle();
    if (!pool || pool.household_id !== householdId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  if (financialAccountId) {
    const { data: fa } = await supabase
      .from("financial_accounts")
      .select("user_id")
      .eq("id", financialAccountId)
      .maybeSingle();
    if (!fa || fa.user_id !== auth.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  try {
    const page = await listUnifiedTransactions(supabase, auth.user.id, {
      limit,
      offset,
      accountId,
      poolId,
      financialAccountId,
      kind,
      transactionType,
      source,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
      category,
    });
    console.info("[api/transactions] listed", {
      userId: auth.user.id,
      count: page.items.length,
      total: page.total,
      dateFrom: dateRange.dateFrom ?? null,
      dateTo: dateRange.dateTo ?? null,
    });
    return NextResponse.json({ configured: true, ...page });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load transactions";
    console.error("[api/transactions] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  void req;
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  console.info("[api/transactions] import disabled", { userId: auth.user.id });
  return NextResponse.json(
    { error: "Budget CSV import is disabled." },
    { status: 410 }
  );
}
