import type { SupabaseClient } from "@supabase/supabase-js";
import type { TravelExpenseSplit, TravelSplitInput } from "@/lib/travel/types";

const AMOUNT_EPS = 0.005;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function myShareFromSplit(split: TravelExpenseSplit | null, fullAmount: number): number {
  if (!split) return fullAmount;
  const mine = split.shares.find((s) => s.companionId == null);
  return mine ? mine.shareAmount : fullAmount;
}

export function validateSplitInput(
  totalAmount: number,
  companionIds: Set<string>,
  input: TravelSplitInput | null | undefined
): { ok: true; split: TravelExpenseSplit | null } | { ok: false; error: string } {
  if (!input) {
    return { ok: true, split: null };
  }

  const paidByCompanionId = input.paidByCompanionId ?? null;
  if (paidByCompanionId && !companionIds.has(paidByCompanionId)) {
    return { ok: false, error: "Paid-by companion not on this trip" };
  }

  if (!input.shares?.length) {
    return { ok: false, error: "Split requires at least one share row" };
  }

  const seen = new Set<string | null>();
  let sum = 0;
  const shares: TravelExpenseSplit["shares"] = [];

  for (const row of input.shares) {
    const companionId = row.companionId ?? null;
    const key = companionId ?? "__me__";
    if (seen.has(key)) {
      return { ok: false, error: "Duplicate share row for the same person" };
    }
    seen.add(key);

    if (companionId && !companionIds.has(companionId)) {
      return { ok: false, error: "Share companion not on this trip" };
    }

    const shareAmount = roundMoney(Number(row.shareAmount));
    if (!(shareAmount >= 0)) {
      return { ok: false, error: "Share amounts must be zero or positive" };
    }
    sum += shareAmount;
    shares.push({ companionId, shareAmount });
  }

  if (!seen.has("__me__")) {
    return { ok: false, error: "Your share is required when splitting" };
  }

  if (Math.abs(sum - totalAmount) > AMOUNT_EPS) {
    return {
      ok: false,
      error: `Shares must sum to ${roundMoney(totalAmount)} (got ${roundMoney(sum)})`,
    };
  }

  return {
    ok: true,
    split: { paidByCompanionId, shares },
  };
}

export async function upsertExpenseSplit(
  supabase: SupabaseClient,
  userId: string,
  tripId: string,
  expenseId: string,
  split: TravelExpenseSplit | null
): Promise<void> {
  if (!split) {
    await supabase.from("travel_expense_split_shares").delete().eq("expense_id", expenseId);
    await supabase.from("travel_expense_splits").delete().eq("expense_id", expenseId);
    return;
  }

  const { error: splitErr } = await supabase.from("travel_expense_splits").upsert(
    {
      expense_id: expenseId,
      user_id: userId,
      trip_id: tripId,
      paid_by_companion_id: split.paidByCompanionId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "expense_id" }
  );
  if (splitErr) throw new Error(splitErr.message);

  await supabase.from("travel_expense_split_shares").delete().eq("expense_id", expenseId);

  const rows = split.shares.map((s) => ({
    expense_id: expenseId,
    user_id: userId,
    companion_id: s.companionId,
    share_amount: s.shareAmount,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error: shareErr } = await supabase.from("travel_expense_split_shares").insert(rows);
    if (shareErr) throw new Error(shareErr.message);
  }
}

export function mapSplitFromDb(
  splitRow: Record<string, unknown> | null,
  shareRows: Record<string, unknown>[]
): TravelExpenseSplit | null {
  if (!splitRow) return null;
  return {
    paidByCompanionId: splitRow.paid_by_companion_id
      ? String(splitRow.paid_by_companion_id)
      : null,
    shares: shareRows.map((r) => ({
      companionId: r.companion_id ? String(r.companion_id) : null,
      shareAmount: Number(r.share_amount ?? 0),
    })),
  };
}
