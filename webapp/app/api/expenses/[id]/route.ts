import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { adjustLoanOutstanding } from "@/lib/expenses/auto-payment";
import { syncExpenseLedgerBeforeDelete } from "@/lib/expenses/expense-ledger-api";
import { mapExpense } from "@/lib/savings/db-mappers";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id } = await params;

  let body: { amount?: number; category?: string; spentAt?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.amount === "number") patch.amount = body.amount;
  if (typeof body.category === "string") patch.category = body.category;
  if (typeof body.spentAt === "string") patch.spent_at = body.spentAt.slice(0, 10);
  if (typeof body.note === "string") patch.note = body.note;

  const supabase = await createAuthedSupabaseClient();
  const { data: row, error } = await supabase
    .from("expenses")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[api/expenses] PATCH failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  console.info("[api/expenses] PATCH ok", { id, userId: user.id });
  return NextResponse.json({ item: mapExpense(row) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id } = await params;

  const supabase = await createAuthedSupabaseClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    console.error("[api/expenses] DELETE fetch failed", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const expense = mapExpense(existing);
  const ledgerReverse = await syncExpenseLedgerBeforeDelete(supabase, user.id, expense);
  if (!ledgerReverse.ok) {
    return NextResponse.json({ error: ledgerReverse.error }, { status: 500 });
  }

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[api/expenses] DELETE failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (existing.auto_category === "debt" && existing.loan_id) {
    const amount = Number(existing.amount ?? 0);
    const adj = await adjustLoanOutstanding(
      supabase,
      user.id,
      String(existing.loan_id),
      amount
    );
    if (!adj.ok) {
      console.error("[api/expenses] DELETE loan restore failed", adj.error);
    }
  }

  console.info("[api/expenses] DELETE ok", {
    id,
    userId: user.id,
    autoCategory: existing.auto_category ?? null,
  });
  return NextResponse.json({ ok: true });
}
