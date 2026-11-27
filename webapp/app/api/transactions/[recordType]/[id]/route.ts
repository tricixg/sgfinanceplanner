import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { updateBudgetTransaction } from "@/lib/budget/transactions";
import {
  getSavingsTransactionById,
} from "@/lib/savings/ledger";
import { mapExpense } from "@/lib/savings/db-mappers";
import { budgetLinePatchForCategoryEdit } from "@/lib/expenses/budget-line-link";
import { deleteTransactionWithLedger } from "@/lib/transactions/actions";
import { isExpenseDeleteBlocked } from "@/lib/expenses/expense-write";
import { withRequestId } from "@/lib/api/with-request-id";

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

export const PATCH = withRequestId(async function PATCH(req: NextRequest, { params }: Params) {
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
    if (typeof body.category === "string") {
      try {
        Object.assign(
          patch,
          await budgetLinePatchForCategoryEdit(supabase, user.id, id, body.category)
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to update category";
        console.error("[api/transactions] PATCH budget line relink failed", msg);
        return apiError("api/transactions/[recordType]/[id]", msg, { fallback: "Failed to update category" });
      }
    }

    const { data, error } = await supabase
      .from("expenses")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();
    if (error) return apiError("api/transactions/[recordType]/[id]", error);
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
    if (error) return apiError("api/transactions/[recordType]/[id]", error);
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
});

export const DELETE = withRequestId(async function DELETE(_req: NextRequest, { params }: Params) {
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
    await deleteTransactionWithLedger(supabase, user.id, recordType, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete transaction";
    const status =
      msg === "Not found"
        ? 404
        : msg === "Insufficient balance" || msg === "Insufficient balance for reversal"
          ? 400
          : isExpenseDeleteBlocked(msg)
            ? 409
            : 500;
    console.error("[transactions-action] DELETE failed", {
      recordType,
      id,
      msg,
    });
    return apiError("api/transactions/[recordType]/[id]", msg, { status, fallback: "Failed to delete transaction" });
  }
});
