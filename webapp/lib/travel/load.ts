import type { SupabaseClient } from "@supabase/supabase-js";
import { mapExpense } from "@/lib/savings/db-mappers";
import type { Expense } from "@/lib/savings/types";
import { parseTripSubCategoryFromNote, TRAVEL_CATEGORY } from "@/lib/travel/notes";
import type {
  TravelExpenseRow,
  TravelTrip,
  TravelTripBudget,
  TravelTripStatus,
} from "@/lib/travel/types";

function mapTrip(row: Record<string, unknown>): TravelTrip {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? ""),
    country: String(row.country ?? ""),
    startDate: String(row.start_date).slice(0, 10),
    endDate: String(row.end_date).slice(0, 10),
    status: (row.status ?? "planned") as TravelTripStatus,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapBudget(row: Record<string, unknown>): TravelTripBudget {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tripId: String(row.trip_id),
    subCategory: String(row.sub_category ?? ""),
    budgetAmount: Number(row.budget_amount ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export async function listTripsForYear(
  supabase: SupabaseClient,
  userId: string,
  year: number
): Promise<TravelTrip[]> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const { data, error } = await supabase
    .from("travel_trips")
    .select("*")
    .eq("user_id", userId)
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapTrip(r));
}

export async function createTrip(
  supabase: SupabaseClient,
  userId: string,
  input: {
    name: string;
    country: string;
    startDate: string;
    endDate: string;
    status?: TravelTripStatus;
  }
): Promise<TravelTrip> {
  const { data, error } = await supabase
    .from("travel_trips")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      country: input.country.trim(),
      start_date: input.startDate,
      end_date: input.endDate,
      status: input.status ?? "planned",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapTrip(data);
}

export async function loadTrip(
  supabase: SupabaseClient,
  userId: string,
  tripId: string
): Promise<TravelTrip | null> {
  const { data, error } = await supabase
    .from("travel_trips")
    .select("*")
    .eq("id", tripId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapTrip(data) : null;
}

export async function updateTrip(
  supabase: SupabaseClient,
  userId: string,
  tripId: string,
  patch: Partial<{
    name: string;
    country: string;
    startDate: string;
    endDate: string;
    status: TravelTripStatus;
  }>
): Promise<TravelTrip> {
  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name != null) dbPatch.name = patch.name.trim();
  if (patch.country != null) dbPatch.country = patch.country.trim();
  if (patch.startDate != null) dbPatch.start_date = patch.startDate;
  if (patch.endDate != null) dbPatch.end_date = patch.endDate;
  if (patch.status != null) dbPatch.status = patch.status;

  const { data, error } = await supabase
    .from("travel_trips")
    .update(dbPatch)
    .eq("id", tripId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapTrip(data);
}

export async function deleteTrip(
  supabase: SupabaseClient,
  userId: string,
  tripId: string
): Promise<void> {
  const { error } = await supabase
    .from("travel_trips")
    .delete()
    .eq("id", tripId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function listTripBudgets(
  supabase: SupabaseClient,
  userId: string,
  tripId: string
): Promise<TravelTripBudget[]> {
  const { data, error } = await supabase
    .from("travel_trip_budgets")
    .select("*")
    .eq("user_id", userId)
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapBudget(r));
}

export async function saveTripBudgets(
  supabase: SupabaseClient,
  userId: string,
  tripId: string,
  incoming: Array<{ id?: string; subCategory: string; budgetAmount: number }>
): Promise<TravelTripBudget[]> {
  const { data: existing, error: exErr } = await supabase
    .from("travel_trip_budgets")
    .select("id")
    .eq("user_id", userId)
    .eq("trip_id", tripId);
  if (exErr) throw new Error(exErr.message);

  const keep = new Set<string>();
  for (let i = 0; i < incoming.length; i++) {
    const row = incoming[i]!;
    const payload = {
      user_id: userId,
      trip_id: tripId,
      sub_category: row.subCategory.trim(),
      budget_amount: row.budgetAmount ?? 0,
      sort_order: i,
      updated_at: new Date().toISOString(),
    };
    const match =
      row.id && (existing ?? []).find((e) => String(e.id) === row.id) ? row.id : null;
    if (match) {
      keep.add(match);
      const { error } = await supabase
        .from("travel_trip_budgets")
        .update(payload)
        .eq("id", match)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabase
        .from("travel_trip_budgets")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (data?.id) keep.add(String(data.id));
    }
  }

  for (const row of existing ?? []) {
    const id = String(row.id);
    if (keep.has(id)) continue;
    const { error } = await supabase
      .from("travel_trip_budgets")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  return listTripBudgets(supabase, userId, tripId);
}

export async function listTripExpenses(
  supabase: SupabaseClient,
  userId: string,
  trip: TravelTrip
): Promise<TravelExpenseRow[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("user_id", userId)
    .eq("category", TRAVEL_CATEGORY)
    .gte("spent_at", trip.startDate)
    .lte("spent_at", trip.endDate)
    .order("spent_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);

  const out: TravelExpenseRow[] = [];
  for (const row of data ?? []) {
    const exp = mapExpense(row);
    const subCategory = parseTripSubCategoryFromNote(trip.name, exp.note);
    if (!subCategory) continue;
    out.push({
      id: exp.id,
      amount: exp.amount,
      spentAt: exp.spentAt,
      note: exp.note,
      subCategory,
      financialAccountId: exp.financialAccountId,
    });
  }
  return out;
}

export async function listTravelExpensesInRange(
  supabase: SupabaseClient,
  userId: string,
  from: string,
  to: string
): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("user_id", userId)
    .eq("category", TRAVEL_CATEGORY)
    .gte("spent_at", from)
    .lte("spent_at", to);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapExpense(r));
}
