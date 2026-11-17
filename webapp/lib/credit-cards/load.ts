import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditCard } from "@/lib/types";
import { ensureCreditCardIds } from "@/lib/finance/card-linking";
import { syncCreditCardFinancialAccountsFromRows } from "@/lib/financial-accounts/sync";
import {
  dbIdFromCard,
  mapCreditCard,
  toCreditCard,
  type DbCreditCard,
} from "@/lib/credit-cards/mappers";

import { SaveError, cleanIdList } from "@/lib/sync/save-error";

export async function loadCreditCards(
  supabase: SupabaseClient,
  userId: string
): Promise<DbCreditCard[]> {
  const { data, error } = await supabase
    .from("credit_cards")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapCreditCard(r));
}

/**
 * Save the card list. Matches rows by `card_key` and updates in place.
 *
 * Cards are only deleted when their key is in `deletedCardKeys` (and not also
 * present in `incoming`). Being absent from `incoming` NEVER deletes a card,
 * because `card_statements.credit_card_id` is ON DELETE CASCADE. A card that
 * has statements can't be deleted — hide it instead.
 */
export async function saveCreditCards(
  supabase: SupabaseClient,
  userId: string,
  incoming: CreditCard[],
  deletedCardKeys: unknown = []
): Promise<CreditCard[]> {
  const withIds = ensureCreditCardIds(incoming);

  const { data: existing, error: existingErr } = await supabase
    .from("credit_cards")
    .select("id, card_key")
    .eq("user_id", userId);
  if (existingErr) throw new Error(existingErr.message);

  const incomingKeys = new Set(withIds.map((c, i) => dbIdFromCard(c, i)));
  const requested = new Set(cleanIdList(deletedCardKeys, () => true));
  const toDelete = (existing ?? []).filter(
    (e) => requested.has(String(e.card_key)) && !incomingKeys.has(String(e.card_key))
  );

  if (toDelete.length > 0) {
    const ids = toDelete.map((e) => String(e.id));
    const { data: used, error: usedErr } = await supabase
      .from("card_statements")
      .select("credit_card_id")
      .in("credit_card_id", ids);
    if (usedErr) throw new Error(usedErr.message);
    if (used && used.length > 0) {
      throw new SaveError(
        "A card with statement history can't be deleted — hide it instead so its history is kept.",
        409
      );
    }
  }

  const savedRows: DbCreditCard[] = [];

  for (let i = 0; i < withIds.length; i++) {
    const c = withIds[i];
    const cardKey = dbIdFromCard(c, i);
    const payload = {
      user_id: userId,
      card_key: cardKey,
      name: c.name ?? "",
      statement_day: c.statementDay ?? 1,
      payment_due_day: c.paymentDueDay ?? 1,
      statement_amount: c.statementAmount ?? 0,
      interest_rate_apr: c.interestRateApr ?? 0,
      include_outstanding_on_statement: Boolean(c.includeOutstandingOnStatement),
      catalog_id: c.catalogId ?? null,
      bank: c.bank ?? null,
      reward_type: c.rewardType ?? null,
      reward_headline: c.rewardHeadline ?? null,
      reward_rules: c.rewardRules ?? [],
      sort_order: i,
      hidden: Boolean(c.hidden),
      updated_at: new Date().toISOString(),
    };

    const existingRow = existing?.find((e) => e.card_key === cardKey);

    if (existingRow?.id) {
      const { data, error } = await supabase
        .from("credit_cards")
        .update(payload)
        .eq("id", existingRow.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      if (data) savedRows.push(mapCreditCard(data));
    } else {
      const { data, error } = await supabase
        .from("credit_cards")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      if (data) savedRows.push(mapCreditCard(data));
    }
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("credit_cards")
      .delete()
      .in(
        "id",
        toDelete.map((e) => String(e.id))
      )
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  await syncCreditCardFinancialAccountsFromRows(supabase, userId, savedRows);
  console.info("[credit-cards] saved", { userId, count: savedRows.length });
  return savedRows.map(toCreditCard);
}
