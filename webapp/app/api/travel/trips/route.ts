import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureTravelBudgetLine } from "@/lib/travel/budget-line";
import { formatTravelExpenseNote } from "@/lib/travel/notes";
import { buildTravelTripSummaries } from "@/lib/travel/summary";
import {
  createTrip,
  listTravelExpensesInRange,
  listTripsForYear,
  loadSplitsForExpenses,
} from "@/lib/travel/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { withRequestId } from "@/lib/api/with-request-id";

export const GET = withRequestId(async function GET(req: NextRequest) {
  try {
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
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    // The budget-line ensure, the trips and the year's travel expenses are independent;
    // trip budgets need the trip ids and the splits need the expense ids, so those two
    // run together afterwards: two round-trips instead of five.
    const [, trips, expenses] = await Promise.all([
      ensureTravelBudgetLine(supabase, userId),
      listTripsForYear(supabase, userId, year),
      listTravelExpensesInRange(supabase, userId, from, to),
    ]);
    const tripIds = trips.map((t) => t.id);
    const [{ data: budgetRows, error: budgetErr }, splitMap] = await Promise.all([
      supabase
        .from("travel_trip_budgets")
        .select("*")
        .eq("user_id", userId)
        .in("trip_id", tripIds.length ? tripIds : ["00000000-0000-0000-0000-000000000000"]),
      loadSplitsForExpenses(
        supabase,
        userId,
        expenses.map((e) => e.id)
      ),
    ]);
    if (budgetErr) {
      return apiError("api/travel/trips", budgetErr);
    }
    const budgets = (budgetRows ?? []).map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      tripId: String(r.trip_id),
      subCategory: String(r.sub_category ?? ""),
      budgetAmount: Number(r.budget_amount ?? 0),
      sortOrder: Number(r.sort_order ?? 0),
    }));
    const items = buildTravelTripSummaries(trips, budgets, expenses, splitMap);
    const totals = {
      budgeted: items.reduce((sum, t) => sum + t.budgeted, 0),
      spent: items.reduce((sum, t) => sum + t.spent, 0),
    };
    return NextResponse.json({ configured: true, items, totals });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load travel trips";
    console.error("[api/travel/trips] GET failed", msg);
    return apiError("api/travel/trips", msg, { fallback: "Failed to load travel trips" });
  }
});

export const POST = withRequestId(async function POST(req: NextRequest) {
  try {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create trip";
    console.error("[api/travel/trips] POST failed", msg);
    return apiError("api/travel/trips", msg, { fallback: "Failed to create trip" });
  }
});
