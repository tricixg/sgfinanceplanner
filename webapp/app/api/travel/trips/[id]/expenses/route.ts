import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { verifyFinancialAccount } from "@/lib/expenses/auto-payment";
import { formatTravelExpenseNote, TRAVEL_CATEGORY } from "@/lib/travel/notes";
import { loadTrip, listTripExpenses } from "@/lib/travel/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const supabase = await createAuthedSupabaseClient();
  const trip = await loadTrip(supabase, auth.user.id, id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const items = await listTripExpenses(supabase, auth.user.id, trip);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  let body: {
    amount?: number;
    spentAt?: string;
    subCategory?: string;
    note?: string;
    financialAccountId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const amount = Number(body.amount ?? NaN);
  const spentAt = String(body.spentAt ?? "").slice(0, 10);
  const subCategory = String(body.subCategory ?? "").trim();
  if (!(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(spentAt) || !subCategory) {
    return NextResponse.json(
      { error: "amount, spentAt (YYYY-MM-DD), and subCategory required" },
      { status: 400 }
    );
  }
  const supabase = await createAuthedSupabaseClient();
  const trip = await loadTrip(supabase, auth.user.id, id);
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const financialAccountId = body.financialAccountId ? String(body.financialAccountId) : null;
  if (financialAccountId) {
    const ok = await verifyFinancialAccount(supabase, auth.user.id, financialAccountId);
    if (!ok) return NextResponse.json({ error: "Invalid financial account" }, { status: 400 });
  }

  const note = formatTravelExpenseNote(trip.name, subCategory, body.note);
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      user_id: auth.user.id,
      amount,
      category: TRAVEL_CATEGORY,
      budget_line_id: null,
      spent_at: spentAt,
      note,
      financial_account_id: financialAccountId,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
