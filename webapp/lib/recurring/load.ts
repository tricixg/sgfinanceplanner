import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecurringSubscription } from "@/lib/types";

function mapSubscription(row: Record<string, unknown>): RecurringSubscription {
  const day = row.deduction_day;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    amount: Number(row.amount ?? 0),
    notes: String(row.notes ?? ""),
    deductionDay:
      typeof day === "number" && day >= 1 && day <= 31 ? day : undefined,
    defaultFinancialAccountId: row.default_financial_account_id
      ? String(row.default_financial_account_id)
      : undefined,
    endMonth: row.end_month ? String(row.end_month) : undefined,
  };
}

export async function loadRecurringSubscriptions(
  supabase: SupabaseClient,
  userId: string
): Promise<RecurringSubscription[]> {
  const { data, error } = await supabase
    .from("recurring_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapSubscription(row));
}

export async function saveRecurringSubscriptions(
  supabase: SupabaseClient,
  userId: string,
  incoming: RecurringSubscription[]
): Promise<RecurringSubscription[]> {
  const { data: existing } = await supabase
    .from("recurring_subscriptions")
    .select("id")
    .eq("user_id", userId);
  const existingIds = new Set((existing ?? []).map((r) => String(r.id)));
  const incomingIds = new Set(incoming.filter((s) => s.id).map((s) => s.id!));

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length) {
    await supabase.from("recurring_subscriptions").delete().in("id", toDelete);
  }

  for (let i = 0; i < incoming.length; i++) {
    const s = incoming[i];
    const row = {
      user_id: userId,
      name: s.name ?? "",
      amount: s.amount ?? 0,
      notes: s.notes ?? "",
      deduction_day: s.deductionDay ?? null,
      default_financial_account_id: s.defaultFinancialAccountId ?? null,
      end_month: s.endMonth ?? null,
      sort_order: i,
      updated_at: new Date().toISOString(),
    };
    if (s.id && existingIds.has(s.id)) {
      await supabase
        .from("recurring_subscriptions")
        .update(row)
        .eq("id", s.id)
        .eq("user_id", userId);
    } else {
      await supabase.from("recurring_subscriptions").insert(row);
    }
  }
  console.info("[recurring] saved subscriptions", { userId, count: incoming.length });
  return loadRecurringSubscriptions(supabase, userId);
}

export async function updateRecurringDeductionDay(
  supabase: SupabaseClient,
  userId: string,
  kind: "debt" | "insurance" | "ilp" | "subscription",
  sourceId: string,
  deductionDay: number | null
): Promise<void> {
  const table =
    kind === "debt"
      ? "loans"
      : kind === "insurance"
        ? "insurance_policies"
        : kind === "ilp"
          ? "ilp_policies"
          : "recurring_subscriptions";

  const { error } = await supabase
    .from(table)
    .update({
      deduction_day: deductionDay,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  console.info("[recurring] deduction day updated", { userId, kind, sourceId, deductionDay });
}
