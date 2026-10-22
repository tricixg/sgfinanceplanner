import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { applyTransaction, listAccountTransactions } from "@/lib/savings/ledger";
import { recordBenefitClaim, verifyBenefit } from "@/lib/benefits/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(
    50,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20)
  );

  const supabase = await createAuthedSupabaseClient();
  const { data: acct } = await supabase
    .from("user_savings_accounts")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  if (!acct || acct.user_id !== auth.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const page = await listAccountTransactions(supabase, id, { limit, offset });
    return NextResponse.json({ configured: true, ...page });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load transactions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id: accountId } = await params;

  let body: {
    amount?: number;
    occurredAt?: string;
    kind?: "deposit" | "withdrawal" | "adjustment";
    note?: string;
    goalId?: string;
    incomeCategoryId?: string;
    excludeFromBudget?: boolean;
    benefitId?: string;
    /** Date the claim counts toward the benefit's cycle (YYYY-MM-DD). Defaults to the deposit date. */
    benefitClaimDate?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawAmount = typeof body.amount === "number" ? body.amount : NaN;
  if (!Number.isFinite(rawAmount) || rawAmount === 0) {
    return NextResponse.json({ error: "Valid non-zero amount required" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  const { data: acct } = await supabase
    .from("user_savings_accounts")
    .select("user_id")
    .eq("id", accountId)
    .maybeSingle();

  if (!acct || acct.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const kind = body.kind ?? "deposit";
  let amount = rawAmount;
  if (kind === "adjustment") {
    // Signed delta applied as-is.
  } else if (kind === "withdrawal" && amount > 0) {
    amount = -amount;
  } else if (kind === "deposit" && amount < 0) {
    amount = -amount;
  }

  if (kind === "deposit" && !body.incomeCategoryId) {
    return NextResponse.json(
      { error: "incomeCategoryId required for deposits" },
      { status: 400 }
    );
  }

  if (body.incomeCategoryId) {
    const { data: cat } = await supabase
      .from("income_categories")
      .select("id")
      .eq("id", body.incomeCategoryId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!cat) {
      return NextResponse.json({ error: "Invalid income category" }, { status: 400 });
    }
  }

  if (body.benefitId && kind !== "deposit") {
    return NextResponse.json({ error: "Benefits can only be applied to deposits" }, { status: 400 });
  }
  const benefit = body.benefitId ? await verifyBenefit(supabase, user.id, body.benefitId) : null;
  if (body.benefitId && !benefit) {
    return NextResponse.json({ error: "Invalid benefit" }, { status: 400 });
  }

  try {
    const item = await applyTransaction(supabase, {
      userId: user.id,
      accountId,
      amount,
      occurredAt: body.occurredAt,
      kind,
      note: body.note,
      goalId: body.goalId ?? null,
      incomeCategoryId: body.incomeCategoryId ?? null,
      excludeFromBudget: body.excludeFromBudget ?? false,
    });
    if (benefit) {
      await recordBenefitClaim(supabase, user.id, {
        benefitId: benefit.id,
        amount,
        claimedAt: body.benefitClaimDate || item.occurredAt.slice(0, 10),
        note: body.note ?? "",
        sourceRecordType: "savings",
        sourceRecordId: item.id,
      });
    }
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transaction failed";
    console.error("[api/accounts/transactions] POST failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
