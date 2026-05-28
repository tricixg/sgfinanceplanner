import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import {
  deleteBudgetTransaction,
  getBudgetTransactionById,
  updateBudgetTransaction,
} from "@/lib/budget/transactions";
import {
  deleteSavingsTransaction,
  getSavingsTransactionById,
} from "@/lib/savings/ledger";
import { syncExpenseLedgerBeforeDelete } from "@/lib/expenses/expense-ledger-api";
import { mapExpense } from "@/lib/savings/db-mappers";
import { adjustLoanOutstanding } from "@/lib/expenses/auto-payment";
import { syncStatementAfterPaymentTransactionDelete } from "@/lib/credit-cards/card-statements/pay";

type Params = { params: Promise<{ recordType: string; id: string }> };

function normalizeRecordType(
  v: string
): "expense" | "savings" | "budget" | null {
  return v === "expense" || v === "savings" || v === "budget" ? v : null;
}

function toYmdOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function toTimeOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  return null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { recordType: rawType, id } = await params;
  const recordType = normalizeRecordType(rawType);
  if (!recordType) {
    return NextResponse.json({ error: "Invalid record type" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();

  if (recordType === "expense") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.category === "string") patch.category = body.category;
    if (typeof body.note === "string") patch.note = body.note;
    const spentAt = toYmdOrNull(body.spentAt);
    if (spentAt) patch.spent_at = spentAt;
    const spentTime = toTimeOrNull(body.spentTime);
    if (spentTime) patch.spent_time = spentTime;

    const { data, error } = await supabase
      .from("expenses")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item: mapExpense(data) });
  }

  if (recordType === "savings") {
    const patch: Record<string, unknown> = {};
    if (typeof body.note === "string") patch.note = body.note;
    if (typeof body.occurredAt === "string") patch.occurred_at = body.occurredAt;
    if (Object.keys(patch).length === 0) {
      const item = await getSavingsTransactionById(supabase, user.id, id);
      return NextResponse.json({ item });
    }
    const { data, error } = await supabase
      .from("savings_transactions")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item: data });
  }

  const item = await updateBudgetTransaction(supabase, user.id, id, {
    amount: typeof body.amount === "number" ? body.amount : undefined,
    spentAt: toYmdOrNull(body.spentAt) ?? undefined,
    spentTime: toTimeOrNull(body.spentTime),
    note: typeof body.note === "string" ? body.note : undefined,
    category: typeof body.category === "string" ? body.category : undefined,
    financialAccountId:
      body.financialAccountId === null
        ? null
        : typeof body.financialAccountId === "string"
          ? body.financialAccountId
          : undefined,
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { recordType: rawType, id } = await params;
  const recordType = normalizeRecordType(rawType);
  if (!recordType) {
    return NextResponse.json({ error: "Invalid record type" }, { status: 400 });
  }
  const supabase = await createAuthedSupabaseClient();
  try {
    if (recordType === "expense") {
      const { data: row, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const expense = mapExpense(row);
      const rev = await syncExpenseLedgerBeforeDelete(supabase, user.id, expense);
      if (!rev.ok) return NextResponse.json({ error: rev.error }, { status: 500 });
      const { error: delErr } = await supabase
        .from("expenses")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
      if (row.auto_category === "debt" && row.loan_id) {
        const adj = await adjustLoanOutstanding(
          supabase,
          user.id,
          String(row.loan_id),
          Number(row.amount ?? 0)
        );
        if (!adj.ok) {
          console.error("[transactions-action] expense delete loan restore failed", adj.error);
        }
      }
      return NextResponse.json({ ok: true });
    }

    if (recordType === "savings") {
      const existing = await getSavingsTransactionById(supabase, user.id, id);
      if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await deleteSavingsTransaction(supabase, user.id, id);
      await syncStatementAfterPaymentTransactionDelete(supabase, user.id, id, existing.amount);
      return NextResponse.json({ ok: true });
    }

    const existing = await getBudgetTransactionById(supabase, user.id, id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await deleteBudgetTransaction(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete transaction";
    console.error("[transactions-action] DELETE failed", {
      recordType,
      id,
      msg,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
