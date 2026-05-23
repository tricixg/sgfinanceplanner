import type { SupabaseClient } from "@supabase/supabase-js";
import { todayYmd } from "@/lib/cards/interest-accrual";

/** Sum BT outstanding on a card that is still within the 0% / promo period (today <= due_date). */
export async function interestFreeBalanceTransferPrincipal(
  supabase: SupabaseClient,
  userId: string,
  creditCardUuid: string,
  asOfDate: string = todayYmd()
): Promise<number> {
  const { data, error } = await supabase
    .from("other_loans")
    .select("outstanding, due_date")
    .eq("user_id", userId)
    .eq("loan_type", "balance_transfer")
    .eq("source_credit_card_id", creditCardUuid)
    .is("paid_at", null);

  if (error) {
    console.error("[interest-free] load BT failed", error.message);
    return 0;
  }

  let total = 0;
  for (const row of data ?? []) {
    const due = row.due_date ? String(row.due_date).slice(0, 10) : "";
    const outstanding = Number(row.outstanding ?? 0);
    if (outstanding <= 0) continue;
    if (due && asOfDate <= due) {
      total += outstanding;
    }
  }

  if (total > 0) {
    console.info("[interest-free] excluded BT principal", {
      creditCardUuid,
      asOfDate,
      total,
    });
  }

  return total;
}
