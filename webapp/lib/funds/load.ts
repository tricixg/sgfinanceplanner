import type { SupabaseClient } from "@supabase/supabase-js";
import { mapFund } from "@/lib/funds/db-mappers";
import { loadFundPayoutTotals } from "@/lib/funds/ledger";
import type { FundsBundle } from "@/lib/funds/types";

export async function loadFundsBundle(
  supabase: SupabaseClient,
  userId: string
): Promise<FundsBundle> {
  const { data: fundRows, error: fundErr } = await supabase
    .from("investment_funds")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (fundErr) {
    console.error("[funds] load failed", fundErr.message);
    throw fundErr;
  }

  const payouts = await loadFundPayoutTotals(supabase, userId);
  const funds = (fundRows ?? []).map((r) => {
    const fund = mapFund(r);
    return { ...fund, lifetimePayouts: payouts.byFund[fund.id] ?? 0 };
  });
  const fundsBalanceTotal = funds.reduce((s, f) => s + f.balance, 0);
  const fundsPnlTotal = payouts.total;

  console.info("[funds] bundle loaded", {
    userId,
    count: funds.length,
    fundsBalanceTotal,
    fundsPnlTotal,
  });

  return { funds, totals: { fundsBalanceTotal, fundsPnlTotal } };
}
