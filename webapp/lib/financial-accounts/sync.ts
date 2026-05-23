import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditCard } from "@/lib/types";
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

/** Upsert credit_card financial_accounts from dashboard creditCards. */
export async function syncCreditCardFinancialAccounts(
  supabase: SupabaseClient,
  userId: string,
  cards: CreditCard[]
): Promise<void> {
  let sort = 1000;
  for (const card of cards) {
    const name = String(card.name ?? "").trim();
    if (!name) continue;
    const cardKey = card.id ? String(card.id) : name.toLowerCase().replace(/\s+/g, "-");

    const { data: byKey } = card.id
      ? await supabase
          .from("financial_accounts")
          .select("id")
          .eq("user_id", userId)
          .eq("card_key", cardKey)
          .maybeSingle()
      : { data: null };

    const { data: byName } = !byKey?.id
      ? await supabase
          .from("financial_accounts")
          .select("id")
          .eq("user_id", userId)
          .eq("name", name)
          .eq("account_type", "credit_card")
          .maybeSingle()
      : { data: byKey };

    const existingId = byName?.id;

    if (existingId) {
      await supabase
        .from("financial_accounts")
        .update({
          name,
          card_key: cardKey,
          account_type: "credit_card",
          sort_order: sort++,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingId);
    } else {
      await supabase.from("financial_accounts").insert({
        user_id: userId,
        name,
        account_type: "credit_card",
        card_key: cardKey,
        sort_order: sort++,
      });
    }
  }

  console.info("[financial-accounts] card sync done", {
    userId,
    count: cards.length,
  });
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
