import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { parseBudgetCsv } from "@/lib/budget/parse-csv";
import { importBudgetRows } from "@/lib/budget/transactions";
import type { SavingsTransactionKind } from "@/lib/savings/types";
import type { BudgetTransactionType } from "@/lib/transactions/types";
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
    });
    console.info("[api/transactions] listed", {
      userId: auth.user.id,
      count: page.items.length,
      total: page.total,
    });
    return NextResponse.json({ configured: true, ...page });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load transactions";
    console.error("[api/transactions] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  let body: { csv?: string; createMissingAccounts?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const csv = typeof body.csv === "string" ? body.csv : "";
  if (!csv.trim()) {
    return NextResponse.json({ error: "csv is required" }, { status: 400 });
  }

  const parsed = parseBudgetCsv(csv);
  if (parsed.errors.length && !parsed.rows.length) {
    return NextResponse.json(
      { error: parsed.errors.join(" "), skipped: parsed.skipped, errors: parsed.errors },
      { status: 400 }
    );
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    const result = await importBudgetRows(supabase, auth.user.id, parsed.rows, {
      createMissingAccounts: body.createMissingAccounts !== false,
    });
    console.info("[api/transactions] import", {
      userId: auth.user.id,
      ...result,
      parseSkipped: parsed.skipped,
    });
    return NextResponse.json({
      configured: true,
      ...result,
      parseSkipped: parsed.skipped,
      errors: parsed.errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    console.error("[api/transactions] POST failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
