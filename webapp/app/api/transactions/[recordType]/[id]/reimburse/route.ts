import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { loadFinancialAccount } from "@/lib/expenses/auto-payment";
import { applyTransaction } from "@/lib/savings/ledger";
import { getBudgetTransactionById, createBudgetTransaction } from "@/lib/budget/transactions";
import { mapExpense } from "@/lib/savings/db-mappers";

type Params = { params: Promise<{ recordType: string; id: string }> };

function normalizeRecordType(
  v: string
): "expense" | "savings" | "budget" | null {
  return v === "expense" || v === "savings" || v === "budget" ? v : null;
}

function toYmd(iso: string): string {
  return iso.slice(0, 10);
}

function toTime(iso: string): string {
  return iso.slice(11, 19);
}

export async function POST(req: NextRequest, { params }: Params) {
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

  let body: { amount?: number; financialAccountId?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const amount = Number(body.amount ?? 0);
  if (!(amount > 0)) {
    return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();

  let defaultFinancialAccountId: string | null = null;
  let category = "Reimbursement";
  let sourceLabel = "transaction";

  if (recordType === "expense") {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const exp = mapExpense(data);
    defaultFinancialAccountId = exp.financialAccountId ?? null;
    category = exp.category || "Expense";
    sourceLabel = `expense:${exp.id}`;
  } else if (recordType === "budget") {
    const tx = await getBudgetTransactionById(supabase, user.id, id);
    if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });
    defaultFinancialAccountId = tx.financialAccountId;
    category = tx.category || "Budget";
    sourceLabel = `budget:${tx.id}`;
  } else {
    const { data, error } = await supabase
      .from("savings_transactions")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (data.account_id) {
      const { data: fa } = await supabase
        .from("financial_accounts")
        .select("id")
        .eq("user_id", user.id)
        .eq("savings_account_id", String(data.account_id))
        .maybeSingle();
      defaultFinancialAccountId = fa?.id ? String(fa.id) : null;
    }
    sourceLabel = `savings:${id}`;
  }

  const financialAccountId = body.financialAccountId ?? defaultFinancialAccountId;
  if (!financialAccountId) {
    return NextResponse.json({ error: "No target account available" }, { status: 400 });
  }
  const account = await loadFinancialAccount(supabase, user.id, financialAccountId);
  if (!account) return NextResponse.json({ error: "Invalid account" }, { status: 400 });

  const nowIso = new Date().toISOString();
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim()
      : `Reimbursement for ${sourceLabel}`;

  if (account.accountType === "cash" && account.savingsAccountId) {
    const row = await applyTransaction(supabase, {
      userId: user.id,
      accountId: account.savingsAccountId,
      amount,
      kind: "deposit",
      occurredAt: nowIso,
      note,
    });
    return NextResponse.json({ item: row, recordType: "savings" });
  }

  const row = await createBudgetTransaction(supabase, user.id, {
    financialAccountId: account.id,
    ledger: account.name,
    category,
    amount,
    spentAt: toYmd(nowIso),
    spentTime: toTime(nowIso),
    note,
    transactionType: "income",
  });
  return NextResponse.json({ item: row, recordType: "budget" });
}
