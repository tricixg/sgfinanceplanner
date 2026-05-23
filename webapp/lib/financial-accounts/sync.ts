import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditCard } from "@/lib/types";
import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import type { FinancialAccount } from "@/lib/transactions/types";
import { mapFinancialAccount } from "@/lib/financial-accounts/mappers";

/** Upsert financial_accounts for each user_savings_accounts row. */
export async function syncCashFinancialAccounts(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data: savingsRows, error } = await supabase
    .from("user_savings_accounts")
    .select("id, name, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("[financial-accounts] cash sync read failed", error.message);
    return;
  }

  for (const row of savingsRows ?? []) {
    const savingsAccountId = String(row.id);
    const name = String(row.name ?? "").trim() || "Cash account";
    const sortOrder = Number(row.sort_order ?? 0);

    const { data: existing } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("savings_account_id", savingsAccountId)
      .maybeSingle();

    if (existing?.id) {
      const { error: updErr } = await supabase
        .from("financial_accounts")
        .update({
          name,
          account_type: "cash",
          sort_order: sortOrder,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updErr) {
        console.warn("[financial-accounts] cash sync update failed", updErr.message);
      }
    } else {
      const { error: insErr } = await supabase.from("financial_accounts").insert({
        user_id: userId,
        name,
        account_type: "cash",
        savings_account_id: savingsAccountId,
        sort_order: sortOrder,
      });
      if (insErr) {
        console.warn("[financial-accounts] cash sync insert failed", insErr.message);
      }
    }
  }

  console.info("[financial-accounts] cash sync done", {
    userId,
    count: savingsRows?.length ?? 0,
  });
}

/** Upsert credit_card financial_accounts from credit_cards table rows. */
export async function syncCreditCardFinancialAccountsFromRows(
  supabase: SupabaseClient,
  userId: string,
  rows: DbCreditCard[]
): Promise<void> {
  let sort = 1000;
  for (const card of rows) {
    const name = card.name.trim() || "Card";
    const cardKey = card.cardKey;

    const { data: byKey } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("card_key", cardKey)
      .maybeSingle();

    const existingId = byKey?.id;
    const now = new Date().toISOString();

    if (existingId) {
      await supabase
        .from("financial_accounts")
        .update({
          name,
          card_key: cardKey,
          account_type: "credit_card",
          sort_order: sort++,
          updated_at: now,
        })
        .eq("id", existingId);
      await supabase
        .from("credit_cards")
        .update({ financial_account_id: existingId, updated_at: now })
        .eq("id", card.id);
    } else {
      const { data: inserted } = await supabase
        .from("financial_accounts")
        .insert({
          user_id: userId,
          name,
          account_type: "credit_card",
          card_key: cardKey,
          sort_order: sort++,
        })
        .select("id")
        .single();
      if (inserted?.id) {
        await supabase
          .from("credit_cards")
          .update({ financial_account_id: inserted.id, updated_at: now })
          .eq("id", card.id);
      }
    }
  }

  console.info("[financial-accounts] card sync from table", {
    userId,
    count: rows.length,
  });
}

/** @deprecated Use syncCreditCardFinancialAccountsFromRows after loading credit_cards table. */
export async function syncCreditCardFinancialAccounts(
  supabase: SupabaseClient,
  userId: string,
  cards: CreditCard[]
): Promise<void> {
  const rows: DbCreditCard[] = cards.map((c, i) => ({
    id: "",
    userId,
    cardKey: c.id ?? `card-${i}`,
    name: c.name ?? "",
    statementDay: c.statementDay ?? 1,
    paymentDueDay: c.paymentDueDay ?? 1,
    statementAmount: c.statementAmount ?? 0,
    interestRateApr: c.interestRateApr ?? 0,
    includeOutstandingOnStatement: Boolean(c.includeOutstandingOnStatement),
    catalogId: c.catalogId ?? null,
    bank: c.bank ?? null,
    rewardType: c.rewardType ?? null,
    rewardHeadline: c.rewardHeadline ?? null,
    rewardRules: c.rewardRules ?? [],
    sortOrder: i,
    financialAccountId: null,
  }));
  await syncCreditCardFinancialAccountsFromRows(supabase, userId, rows);
}

export async function loadFinancialAccounts(
  supabase: SupabaseClient,
  userId: string
): Promise<FinancialAccount[]> {
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapFinancialAccount(r));
}

export async function findOrCreateFinancialAccountByName(
  supabase: SupabaseClient,
  userId: string,
  accountName: string,
  createIfMissing: boolean
): Promise<FinancialAccount | null> {
  const name = accountName.trim();
  if (!name) return null;

  const { data: existing } = await supabase
    .from("financial_accounts")
    .select("*")
    .eq("user_id", userId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (existing) return mapFinancialAccount(existing);

  if (!createIfMissing) return null;

  const { data: inserted, error } = await supabase
    .from("financial_accounts")
    .insert({
      user_id: userId,
      name,
      account_type: "credit_card",
    })
    .select("*")
    .single();

  if (error || !inserted) {
    console.warn("[financial-accounts] create by name failed", error?.message);
    return null;
  }

  console.info("[financial-accounts] created from import", { userId, name });
  return mapFinancialAccount(inserted);
}
