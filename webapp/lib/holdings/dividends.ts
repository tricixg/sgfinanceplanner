import type { SupabaseClient } from "@supabase/supabase-js";
import type { HoldingDividend } from "@/lib/holdings/types";

function mapHoldingDividend(row: Record<string, unknown>): HoldingDividend {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    holdingId: String(row.holding_id),
    perShare: Number(row.per_share ?? 0),
    qty: Number(row.qty ?? 0),
    amount: Number(row.amount ?? 0),
    occurredAt: String(row.occurred_at),
    note: String(row.note ?? ""),
    createdAt: String(row.created_at),
  };
}

export type AddHoldingDividendInput = {
  userId: string;
  holdingId: string;
  perShare: number;
  occurredAt?: string;
  note?: string;
};

/** Records a dividend payout for a holding — total is qty (at record time) × per-share amount. */
export async function addHoldingDividend(
  supabase: SupabaseClient,
  input: AddHoldingDividendInput
): Promise<HoldingDividend> {
  if (!Number.isFinite(input.perShare) || input.perShare <= 0) {
    throw new Error("Dividend per share must be a positive number");
  }

  const { data: holding, error: readErr } = await supabase
    .from("holdings")
    .select("id, qty, user_id")
    .eq("id", input.holdingId)
    .maybeSingle();

  if (readErr || !holding) {
    throw new Error(readErr?.message ?? "Holding not found");
  }
  if (holding.user_id !== input.userId) {
    throw new Error("Forbidden");
  }

  const qty = Number(holding.qty ?? 0);
  const amount = qty * input.perShare;

  const { data: row, error: insErr } = await supabase
    .from("holding_dividends")
    .insert({
      user_id: input.userId,
      holding_id: input.holdingId,
      per_share: input.perShare,
      qty,
      amount,
      occurred_at: (input.occurredAt ?? new Date().toISOString()).slice(0, 10),
      note: input.note ?? "",
    })
    .select("*")
    .single();

  if (insErr || !row) {
    throw new Error(insErr?.message ?? "Failed to record dividend");
  }

  console.info("[holdings/dividends] dividend recorded", {
    userId: input.userId,
    holdingId: input.holdingId,
    perShare: input.perShare,
    qty,
    amount,
  });

  return mapHoldingDividend(row);
}

export async function deleteHoldingDividend(
  supabase: SupabaseClient,
  input: { userId: string; holdingId: string; dividendId: string }
): Promise<void> {
  const { data, error } = await supabase
    .from("holding_dividends")
    .delete()
    .eq("id", input.dividendId)
    .eq("holding_id", input.holdingId)
    .eq("user_id", input.userId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Dividend not found");

  console.info("[holdings/dividends] dividend deleted", {
    userId: input.userId,
    holdingId: input.holdingId,
    dividendId: input.dividendId,
  });
}

export async function listHoldingDividends(
  supabase: SupabaseClient,
  holdingId: string,
  opts: { limit?: number; offset?: number } = {}
) {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const { data, error, count } = await supabase
    .from("holding_dividends")
    .select("*", { count: "exact" })
    .eq("holding_id", holdingId)
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  return {
    items: (data ?? []).map(mapHoldingDividend),
    total: count ?? 0,
    nextOffset: offset + (data?.length ?? 0) < (count ?? 0) ? offset + limit : null,
  };
}

/** Lifetime dividends for a user, both overall and broken down per holding. */
export async function loadHoldingDividendTotals(
  supabase: SupabaseClient,
  userId: string
): Promise<{ total: number; byHolding: Record<string, number> }> {
  const { data, error } = await supabase
    .from("holding_dividends")
    .select("holding_id, amount")
    .eq("user_id", userId);

  if (error) {
    console.warn("[holdings/dividends] totals load failed", error.message);
    return { total: 0, byHolding: {} };
  }

  const byHolding: Record<string, number> = {};
  let total = 0;
  for (const row of data ?? []) {
    const amount = Number(row.amount ?? 0);
    const holdingId = String(row.holding_id);
    byHolding[holdingId] = (byHolding[holdingId] ?? 0) + amount;
    total += amount;
  }
  return { total, byHolding };
}
