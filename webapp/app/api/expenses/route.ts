import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import {
  adjustLoanOutstanding,
  autoPaymentInsertRow,
  sourceIdFromPayload,
  validateAutoPaymentPayload,
  verifyAutoPaymentSource,
  verifyFinancialAccount,
  type AutoPaymentPayload,
} from "@/lib/expenses/auto-payment";
import {
  isExpenseBudgetType,
  mapDbBudgetLine,
  resolveBudgetLineId,
} from "@/lib/expenses/budget-match";
import { mapExpense } from "@/lib/savings/db-mappers";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [], nextCursor: null });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const offset = Math.max(
    0,
    parseInt(searchParams.get("offset") ?? "0", 10) || 0
  );
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );

  const supabase = await createAuthedSupabaseClient();
  let query = supabase
    .from("expenses")
    .select("*", { count: "exact" })
    .eq("user_id", user.id)
    .order("spent_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (from) query = query.gte("spent_at", from);
  if (to) query = query.lte("spent_at", to);

  const { data: rows, error, count } = await query;

  if (error) {
    console.error("[api/expenses] GET failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const page = rows ?? [];
  const total = count ?? 0;
  const nextOffset = offset + page.length < total ? offset + page.length : null;

  console.info("[api/expenses] GET", {
    userId: user.id,
    count: page.length,
    offset,
    total,
  });

  return NextResponse.json({
    configured: true,
    items: page.map((r) => mapExpense(r)),
    nextOffset,
    total,
  });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: {
    amount?: number;
    category?: string;
    budgetLineId?: string;
    autoCategory?: string;
    loanId?: string;
    insurancePolicyId?: string;
    ilpPolicyId?: string;
    subscriptionId?: string;
    financialAccountId?: string;
    spentAt?: string;
    note?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = typeof body.amount === "number" ? body.amount : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
  }

  const spentAt =
    typeof body.spentAt === "string" && body.spentAt.length >= 10
      ? body.spentAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  const supabase = await createAuthedSupabaseClient();

  if (body.autoCategory) {
    const validated = validateAutoPaymentPayload(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const payload: AutoPaymentPayload = {
      autoCategory: validated.autoCategory,
      loanId: body.loanId,
      insurancePolicyId: body.insurancePolicyId,
      ilpPolicyId: body.ilpPolicyId,
      subscriptionId: body.subscriptionId,
      amount,
      spentAt,
      note: body.note,
      financialAccountId: body.financialAccountId,
    };

    const sourceId = sourceIdFromPayload(payload);
    const sourceOk = await verifyAutoPaymentSource(
      supabase,
      user.id,
      validated.autoCategory,
      sourceId
    );
    if (!sourceOk) {
      return NextResponse.json({ error: "Source record not found" }, { status: 404 });
    }

    if (body.financialAccountId) {
      const acctOk = await verifyFinancialAccount(
        supabase,
        user.id,
        body.financialAccountId
      );
      if (!acctOk) {
        return NextResponse.json({ error: "Invalid financial account" }, { status: 400 });
      }
    }

    const { data: row, error } = await supabase
      .from("expenses")
      .insert(autoPaymentInsertRow(user.id, payload))
      .select("*")
      .single();

    if (error) {
      console.error("[api/expenses] auto payment POST failed", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (validated.autoCategory === "debt" && body.loanId) {
      const adj = await adjustLoanOutstanding(supabase, user.id, body.loanId, -amount);
      if (!adj.ok) {
        await supabase.from("expenses").delete().eq("id", row.id);
        return NextResponse.json({ error: adj.error }, { status: 500 });
      }
    }

    console.info("[api/expenses] auto payment POST ok", {
      userId: user.id,
      autoCategory: validated.autoCategory,
      sourceId,
      amount,
      spentAt,
    });
    return NextResponse.json({ item: mapExpense(row) });
  }

  const { data: budgetRows } = await supabase
    .from("budget_lines")
    .select("*")
    .eq("user_id", user.id);

  const budgetLines = (budgetRows ?? []).map((r) => mapDbBudgetLine(r));

  const budgetLineId = resolveBudgetLineId(
    budgetLines,
    body.category ?? "",
    body.budgetLineId ?? null
  );

  if (!budgetLineId) {
    return NextResponse.json(
      { error: "budgetLineId or matching budget category required" },
      { status: 400 }
    );
  }

  const budgetLine = budgetLines.find((l) => l.id === budgetLineId);
  if (!budgetLine || !isExpenseBudgetType(budgetLine.lineType)) {
    return NextResponse.json({ error: "Invalid budget category" }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from("expenses")
    .insert({
      user_id: user.id,
      amount,
      category: budgetLine.category,
      budget_line_id: budgetLineId,
      spent_at: spentAt,
      note: body.note ?? "",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[api/expenses] POST failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.info("[api/expenses] POST ok", {
    userId: user.id,
    amount,
    spentAt,
    budgetLineId,
  });
  return NextResponse.json({ item: mapExpense(row) });
}
