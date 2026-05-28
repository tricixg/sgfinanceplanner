import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureTravelBudgetLine } from "@/lib/travel/budget-line";
import { formatTravelExpenseNote } from "@/lib/travel/notes";
import { buildTravelTripSummaries } from "@/lib/travel/summary";
import { createTrip, listTravelExpensesInRange, listTripsForYear } from "@/lib/travel/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [], totals: { budgeted: 0, spent: 0 } });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const userId = auth.user.id;
  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  await ensureTravelBudgetLine(supabase, userId);
  const trips = await listTripsForYear(supabase, userId, year);
  const tripIds = trips.map((t) => t.id);
  const { data: budgetRows, error: budgetErr } = await supabase
    .from("travel_trip_budgets")
    .select("*")
    .eq("user_id", userId)
    .in("trip_id", tripIds.length ? tripIds : ["00000000-0000-0000-0000-000000000000"]);
  if (budgetErr) {
    return NextResponse.json({ error: budgetErr.message }, { status: 500 });
  }
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const expenses = await listTravelExpensesInRange(supabase, userId, from, to);
  const budgets = (budgetRows ?? []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    tripId: String(r.trip_id),
    subCategory: String(r.sub_category ?? ""),
    budgetAmount: Number(r.budget_amount ?? 0),
    sortOrder: Number(r.sort_order ?? 0),
  }));
  const items = buildTravelTripSummaries(trips, budgets, expenses);
  const totals = {
    budgeted: items.reduce((sum, t) => sum + t.budgeted, 0),
    spent: items.reduce((sum, t) => sum + t.spent, 0),
  };
  return NextResponse.json({ configured: true, items, totals });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const userId = auth.user.id;
  let body: {
    name?: string;
    country?: string;
    startDate?: string;
    endDate?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  const country = String(body.country ?? "").trim();
  const startDate = String(body.startDate ?? "").slice(0, 10);
  const endDate = String(body.endDate ?? "").slice(0, 10);
  if (!name || !country || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: "name, country, startDate, endDate required" }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "End date must be on/after start date" }, { status: 400 });
  }
  const supabase = await createAuthedSupabaseClient();
  await ensureTravelBudgetLine(supabase, userId);
  const item = await createTrip(supabase, userId, { name, country, startDate, endDate });
  console.info("[api/travel/trips] created", {
    userId,
    tripId: item.id,
    noteExample: formatTravelExpenseNote(item.name, "misc"),
  });
  return NextResponse.json({ item });
}
