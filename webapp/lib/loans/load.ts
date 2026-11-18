import type { SupabaseClient } from "@supabase/supabase-js";
import type { Loan } from "@/lib/types";

import { SaveError, cleanIdList, isPersistedId } from "@/lib/sync/save-error";

export async function loadLoans(
  supabase: SupabaseClient,
  userId: string
): Promise<Loan[]> {
  const { loadInstalmentLoans } = await import("@/lib/other-loans/load");
  return loadInstalmentLoans(supabase, userId);
}

async function cardKeyToUuid(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("credit_cards")
    .select("id, card_key")
    .eq("user_id", userId);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.card_key), String(row.id));
  }
  return map;
}

/**
 * Save instalment plans. Rows are matched by DB `id`; rows without a persisted
 * id are inserted. Rows are deleted only when their id is in `deletedIds`.
 * Plans with `monthly = 0` are kept like any other plan.
 */
export async function saveLoans(
  supabase: SupabaseClient,
  userId: string,
  incoming: Loan[],
  deletedIds: unknown = []
): Promise<Loan[]> {
  const keyToUuid = await cardKeyToUuid(supabase, userId);

  for (let i = 0; i < incoming.length; i++) {
    const l = incoming[i];
    const creditCardId = l.cardId ? keyToUuid.get(l.cardId) ?? null : null;
    const payload = {
      name: l.name ?? "",
      card_label: l.card ?? "",
      credit_card_id: creditCardId,
      monthly: l.monthly ?? 0,
      outstanding: l.out ?? 0,
      end_ym: l.end ?? "",
      deduction_day: l.deductionDay ?? null,
      default_financial_account_id: l.defaultFinancialAccountId ?? null,
      sort_order: i,
      updated_at: new Date().toISOString(),
    };

    if (isPersistedId(l.id)) {
      const { data, error } = await supabase
        .from("loans")
        .update(payload)
        .eq("id", l.id)
        .eq("user_id", userId)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new SaveError(
          `Instalment plan "${l.name}" no longer exists. Reload and try again.`,
          409
        );
      }
    } else {
      const { error } = await supabase
        .from("loans")
        .insert({ user_id: userId, ...payload });
      if (error) throw new Error(error.message);
    }
  }

  const toDelete = cleanIdList(deletedIds).filter(
    (id) => !incoming.some((l) => l.id === id)
  );
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("loans")
      .delete()
      .in("id", toDelete)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  console.info("[loans] saved instalment plans", {
    userId,
    count: incoming.length,
    deleted: toDelete.length,
  });
  return loadLoans(supabase, userId);
}
