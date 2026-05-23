import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAccountTotals } from "@/lib/finance/savings-totals";
import type { AccountsBundle } from "@/lib/savings/types";
import { mapAccount } from "@/lib/savings/db-mappers";

export async function loadAccountsBundle(
  supabase: SupabaseClient,
  userId: string
): Promise<AccountsBundle> {
  const { data: accountRows, error: acctErr } = await supabase
    .from("user_savings_accounts")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (acctErr) {
    console.error("[accounts] load failed", acctErr.message);
    throw acctErr;
  }

  const accounts = (accountRows ?? []).map((r) => mapAccount(r));
  const totals = buildAccountTotals(accounts);

  console.info("[accounts] bundle loaded", {
    userId,
    count: accounts.length,
    ...totals,
  });

  return { accounts, totals };
}
