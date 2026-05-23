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

const UUID_RE = /^[0-9a-f-]{36}$/i;

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

export async function saveCreditCards(
  supabase: SupabaseClient,
  userId: string,
  incoming: CreditCard[]
): Promise<CreditCard[]> {
  const withIds = ensureCreditCardIds(incoming);

  const { data: existing } = await supabase
    .from("credit_cards")
    .select("id, card_key")
    .eq("user_id", userId);

  const incomingKeys = withIds.map((c, i) => dbIdFromCard(c, i));
  const keepIds = new Set(
    (existing ?? [])
      .filter((e) => incomingKeys.includes(String(e.card_key)))
      .map((e) => String(e.id))
      .filter((id) => UUID_RE.test(id))
  );

  for (const row of existing ?? []) {
    if (!keepIds.has(row.id)) {
      await supabase.from("credit_cards").delete().eq("id", row.id);
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

  await syncCreditCardFinancialAccountsFromRows(supabase, userId, savedRows);
  console.info("[credit-cards] saved", { userId, count: savedRows.length });
  return savedRows.map(toCreditCard);
}
