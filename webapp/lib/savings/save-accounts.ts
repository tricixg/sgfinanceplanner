import type { SupabaseClient } from "@supabase/supabase-js";
import { applyTransaction } from "@/lib/savings/ledger";
import type { UserSavingsAccount } from "@/lib/savings/types";
import { SaveError, cleanIdList, isPersistedId } from "@/lib/sync/save-error";

/**
 * Save cash-account configuration. Existing rows (persisted id) are updated in
 * place; rows without one are inserted (with an opening-balance ledger entry).
 *
 * Accounts are deleted only when listed in `deletedIds`. Omission never
 * deletes, because `savings_transactions.account_id` is ON DELETE CASCADE.
 * An account that has ledger history can't be deleted — hide it instead.
 */
export async function saveAccountsConfig(
  supabase: SupabaseClient,
  userId: string,
  incoming: Partial<UserSavingsAccount>[],
  deletedIds: unknown = []
): Promise<void> {
  const now = new Date().toISOString();

  for (let i = 0; i < incoming.length; i++) {
    const a = incoming[i];

    if (isPersistedId(a.id)) {
      const { data, error } = await supabase
        .from("user_savings_accounts")
        .update({
          name: a.name ?? "",
          notes: a.notes ?? "",
          include_in_savings: a.includeInSavings !== false,
          sort_order: a.sortOrder ?? i,
          hidden: a.hidden === true,
          updated_at: now,
        })
        .eq("id", a.id)
        .eq("user_id", userId)
        .select("id");
      if (error) throw new SaveError(error.message, 500);
      if (!data || data.length === 0) {
        throw new SaveError(
          `Account "${a.name ?? ""}" no longer exists. Reload and try again.`,
          409
        );
      }
      continue;
    }

    const opening = typeof a.balance === "number" ? a.balance : 0;
    const { data: row, error } = await supabase
      .from("user_savings_accounts")
      .insert({
        user_id: userId,
        name: a.name ?? "New account",
        balance: 0,
        notes: a.notes ?? "",
        include_in_savings: a.includeInSavings !== false,
        sort_order: a.sortOrder ?? i,
        updated_at: now,
      })
      .select("id")
      .single();
    if (error) throw new SaveError(error.message, 500);

    if (opening !== 0 && row?.id) {
      await applyTransaction(supabase, {
        userId,
        accountId: row.id,
        amount: opening,
        kind: "adjustment",
        note: "Opening balance",
      });
    }
  }

  const toDelete = cleanIdList(deletedIds).filter(
    (id) => !incoming.some((a) => a.id === id)
  );
  if (toDelete.length > 0) {
    const { data: used, error: usedErr } = await supabase
      .from("savings_transactions")
      .select("account_id")
      .in("account_id", toDelete);
    if (usedErr) throw new SaveError(usedErr.message, 500);
    if (used && used.length > 0) {
      throw new SaveError(
        "An account with transaction history can't be deleted — hide it instead so its history is kept.",
        409
      );
    }
    const { error } = await supabase
      .from("user_savings_accounts")
      .delete()
      .in("id", toDelete)
      .eq("user_id", userId);
    if (error) throw new SaveError(error.message, 500);
  }
}
