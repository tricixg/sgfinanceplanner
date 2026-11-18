import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { budgetLinePatchForCategoryEdit } from "@/lib/expenses/budget-line-link";
import { mapExpense } from "@/lib/savings/db-mappers";
import { deleteExpenseWithLedger, isExpenseDeleteBlocked } from "@/lib/expenses/expense-write";
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
  if (typeof body.category === "string") {
    try {
      Object.assign(
        patch,
        await budgetLinePatchForCategoryEdit(supabase, user.id, id, body.category)
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update category";
      console.error("[api/expenses] PATCH budget line relink failed", msg);
      return apiError("api/expenses/[id]", msg, { fallback: "Failed to update category" });
    }
  }
  const { data: row, error } = await supabase
    .from("expenses")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[api/expenses] PATCH failed", error.message);
    return apiError("api/expenses/[id]", error);
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

  // Reverse ledger rows, delete the expense, restore loan / other loan /
  // BNPL / fund — one database transaction; refused as a whole if any step
  // can't be done.
  let result: Awaited<ReturnType<typeof deleteExpenseWithLedger>>;
  try {
    result = await deleteExpenseWithLedger(supabase, user.id, id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/expenses] DELETE failed", msg);
    return apiError("api/expenses/[id]", e, { status: isExpenseDeleteBlocked(msg) ? 409 : 500 });
  }
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const existing = result.expense;

  console.info("[api/expenses] DELETE ok", {
    id,
    userId: user.id,
    autoCategory: existing.auto_category ?? null,
  });
  return NextResponse.json({ ok: true });
}
