import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { verifyFinancialAccount } from "@/lib/expenses/auto-payment";
import { formatTravelExpenseNote } from "@/lib/travel/notes";
import { parseTravelSpentAtInput } from "@/lib/travel/expense-input";
import { loadTrip, listTripExpenses } from "@/lib/travel/load";
import { mapExpense } from "@/lib/savings/db-mappers";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string; expenseId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id: tripId, expenseId } = await params;

  let body: {
    amount?: number;
    spentAt?: string;
    subCategory?: string;
    note?: string;
    financialAccountId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = typeof body.amount === "number" ? body.amount : NaN;
  const subCategory = String(body.subCategory ?? "").trim();
  if (!Number.isFinite(amount) || amount <= 0 || !subCategory) {
    return NextResponse.json(
      { error: "Valid amount and subCategory required" },
      { status: 400 }
    );
  }

  const { spentAt, spentTime } = parseTravelSpentAtInput(body.spentAt);

  const supabase = await createAuthedSupabaseClient();
  const trip = await loadTrip(supabase, auth.user.id, tripId);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tripExpenses = await listTripExpenses(supabase, auth.user.id, trip);
  if (!tripExpenses.some((e) => e.id === expenseId)) {
    return NextResponse.json({ error: "Expense not found for this trip" }, { status: 404 });
  }

  const financialAccountId =
    body.financialAccountId === null || body.financialAccountId === ""
      ? null
      : body.financialAccountId
        ? String(body.financialAccountId)
        : undefined;

  if (financialAccountId) {
    const ok = await verifyFinancialAccount(supabase, auth.user.id, financialAccountId);
    if (!ok) return NextResponse.json({ error: "Invalid financial account" }, { status: 400 });
  }

  const note = formatTravelExpenseNote(trip.name, subCategory, body.note);

  const patch: Record<string, unknown> = {
    amount,
    spent_at: spentAt,
    spent_time: spentTime,
    note,
    updated_at: new Date().toISOString(),
  };
  if (financialAccountId !== undefined) {
    patch.financial_account_id = financialAccountId;
  }

  const { data, error } = await supabase
    .from("expenses")
    .update(patch)
    .eq("id", expenseId)
    .eq("user_id", auth.user.id)
    .select("*")
    .single();

  if (error) {
    console.error("[api/travel/trips/expenses] PATCH failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.info("[api/travel/trips/expenses] PATCH ok", {
    tripId,
    expenseId,
    spentAt,
    spentTime,
    subCategory,
    amount,
  });

  return NextResponse.json({ item: mapExpense(data) });
}
