import type { SupabaseClient } from "@supabase/supabase-js";
import { listTripCompanions } from "@/lib/travel/load";
import { upsertExpenseSplit, validateSplitInput } from "@/lib/travel/split";
import type { TravelSplitInput } from "@/lib/travel/types";

export async function resolveAndSaveExpenseSplit(
  supabase: SupabaseClient,
  userId: string,
  tripId: string,
  expenseId: string,
  amount: number,
  splitInput: TravelSplitInput | null | undefined,
  options?: { clearIfUndefined?: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (splitInput === undefined && !options?.clearIfUndefined) {
    return { ok: true };
  }

  const companions = await listTripCompanions(supabase, userId, tripId);
  const companionIds = new Set(companions.map((c) => c.id));

  const validated = validateSplitInput(amount, companionIds, splitInput ?? null);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  await upsertExpenseSplit(supabase, userId, tripId, expenseId, validated.split);
  return { ok: true };
}

export function parseSplitBody(
  raw: unknown
): TravelSplitInput | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "object" || raw === null) return undefined;
  const obj = raw as {
    paidByCompanionId?: string | null;
    shares?: Array<{ companionId?: string | null; shareAmount?: number }>;
  };
  return {
    paidByCompanionId: obj.paidByCompanionId ?? null,
    shares: (obj.shares ?? []).map((s) => ({
      companionId: s.companionId ?? null,
      shareAmount: Number(s.shareAmount ?? 0),
    })),
  };
}
