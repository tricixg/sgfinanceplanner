import type { SupabaseClient } from "@supabase/supabase-js";
import { mapExpense } from "@/lib/savings/db-mappers";
import type { Expense } from "@/lib/savings/types";
import { DEFAULT_TRAVEL_SUBCATEGORIES } from "@/lib/travel/defaults";
import { parseTravelExpenseParts, TRAVEL_CATEGORY } from "@/lib/travel/notes";
import { mapSplitFromDb, myShareFromSplit } from "@/lib/travel/split";
import type {
  TravelCompanion,
  TravelExpenseRow,
  TravelSettlement,
  TravelSettlementDirection,
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

function mapCompanion(row: Record<string, unknown>): TravelCompanion {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tripId: String(row.trip_id),
    name: String(row.name ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapSettlement(row: Record<string, unknown>): TravelSettlement {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tripId: String(row.trip_id),
    companionId: String(row.companion_id),
    direction: row.direction as TravelSettlementDirection,
    amount: Number(row.amount ?? 0),
    settledAt: String(row.settled_at).slice(0, 10),
    note: String(row.note ?? ""),
    financialAccountId: row.financial_account_id
      ? String(row.financial_account_id)
      : null,
    savingsTransactionId: row.savings_transaction_id
      ? String(row.savings_transaction_id)
      : null,
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
  const trip = mapTrip(data);

  const { error: budgetErr } = await supabase.from("travel_trip_budgets").insert(
    DEFAULT_TRAVEL_SUBCATEGORIES.map((subCategory, i) => ({
      user_id: userId,
      trip_id: trip.id,
      sub_category: subCategory,
      budget_amount: 0,
      sort_order: i,
    }))
  );
  if (budgetErr) throw new Error(budgetErr.message);

  return trip;
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

export async function listTripCompanions(
  supabase: SupabaseClient,
  userId: string,
  tripId: string
): Promise<TravelCompanion[]> {
  const { data, error } = await supabase
    .from("travel_trip_companions")
    .select("*")
    .eq("user_id", userId)
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapCompanion(r));
}

export async function addTripCompanion(
  supabase: SupabaseClient,
  userId: string,
  tripId: string,
  name: string
): Promise<TravelCompanion> {
  const existing = await listTripCompanions(supabase, userId, tripId);
  const { data, error } = await supabase
    .from("travel_trip_companions")
    .insert({
      user_id: userId,
      trip_id: tripId,
      name: name.trim(),
      sort_order: existing.length,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  console.info("[travel] companion added", { userId, tripId, name: name.trim() });
  return mapCompanion(data);
}

export async function updateTripCompanion(
  supabase: SupabaseClient,
  userId: string,
  tripId: string,
  companionId: string,
  name: string
): Promise<TravelCompanion> {
  const { data, error } = await supabase
    .from("travel_trip_companions")
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq("id", companionId)
    .eq("user_id", userId)
    .eq("trip_id", tripId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapCompanion(data);
}

export async function deleteTripCompanion(
  supabase: SupabaseClient,
  userId: string,
  tripId: string,
  companionId: string
): Promise<void> {
  const { error } = await supabase
    .from("travel_trip_companions")
    .delete()
    .eq("id", companionId)
    .eq("user_id", userId)
    .eq("trip_id", tripId);
  if (error) throw new Error(error.message);
}

export async function listTripSettlements(
  supabase: SupabaseClient,
  userId: string,
  tripId: string
): Promise<TravelSettlement[]> {
  const { data, error } = await supabase
    .from("travel_companion_settlements")
    .select("*")
    .eq("user_id", userId)
    .eq("trip_id", tripId)
    .order("settled_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapSettlement(r));
}

export async function createTripSettlement(
  supabase: SupabaseClient,
  userId: string,
  tripId: string,
  input: {
    companionId: string;
    direction: TravelSettlementDirection;
    amount: number;
    settledAt: string;
    note?: string;
    financialAccountId?: string | null;
    savingsTransactionId?: string | null;
  }
): Promise<TravelSettlement> {
  const { data, error } = await supabase
    .from("travel_companion_settlements")
    .insert({
      user_id: userId,
      trip_id: tripId,
      companion_id: input.companionId,
      direction: input.direction,
      amount: input.amount,
      settled_at: input.settledAt,
      note: input.note?.trim() ?? "",
      financial_account_id: input.financialAccountId ?? null,
      savings_transaction_id: input.savingsTransactionId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  console.info("[travel] settlement recorded", {
    userId,
    tripId,
    companionId: input.companionId,
    direction: input.direction,
    amount: input.amount,
  });
  return mapSettlement(data);
}

export async function loadSplitsForExpenses(
  supabase: SupabaseClient,
  userId: string,
  expenseIds: string[]
): Promise<Map<string, ReturnType<typeof mapSplitFromDb>>> {
  const out = new Map<string, ReturnType<typeof mapSplitFromDb>>();
  if (expenseIds.length === 0) return out;

  const { data: splits, error: splitErr } = await supabase
    .from("travel_expense_splits")
    .select("*")
    .eq("user_id", userId)
    .in("expense_id", expenseIds);
  if (splitErr) throw new Error(splitErr.message);

  const { data: shares, error: shareErr } = await supabase
    .from("travel_expense_split_shares")
    .select("*")
    .eq("user_id", userId)
    .in("expense_id", expenseIds);
  if (shareErr) throw new Error(shareErr.message);

  const sharesByExpense = new Map<string, Record<string, unknown>[]>();
  for (const row of shares ?? []) {
    const eid = String(row.expense_id);
    const list = sharesByExpense.get(eid) ?? [];
    list.push(row);
    sharesByExpense.set(eid, list);
  }

  for (const row of splits ?? []) {
    const eid = String(row.expense_id);
    out.set(eid, mapSplitFromDb(row, sharesByExpense.get(eid) ?? []));
  }
  return out;
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
    .order("spent_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);

  const matched: { exp: ReturnType<typeof mapExpense>; parts: NonNullable<ReturnType<typeof parseTravelExpenseParts>> }[] = [];
  for (const row of data ?? []) {
    const exp = mapExpense(row);
    const parts = parseTravelExpenseParts(trip.name, exp.note);
    if (!parts) continue;
    matched.push({ exp, parts });
  }

  const splitMap = await loadSplitsForExpenses(
    supabase,
    userId,
    matched.map((m) => m.exp.id)
  );

  return matched.map(({ exp, parts }) => {
    const split = splitMap.get(exp.id) ?? null;
    const budgetAmount = myShareFromSplit(split, exp.amount);
    return {
      id: exp.id,
      amount: exp.amount,
      budgetAmount,
      spentAt: exp.spentAt,
      spentTime: exp.spentTime ?? null,
      note: exp.note,
      extraNote: parts.extraNote,
      subCategory: parts.subCategory,
      financialAccountId: exp.financialAccountId,
      split,
    };
  });
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
