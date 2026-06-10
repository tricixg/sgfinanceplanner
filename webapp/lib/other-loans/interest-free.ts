import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailySpendMap } from "@/lib/cards/interest-accrual";
import { roundMoney } from "@/lib/cards/interest-accrual";
import { sgtTodayYmd } from "@/lib/time/sgt";

type BtRow = {
  outstanding: unknown;
  due_date: unknown;
  bt_start_date: unknown;
  tenure_months: unknown;
  finance_charge: unknown;
};

export type BalanceTransferInterestExclusion = {
  /** BT principal + one-time finance charge to omit from interest-bearing balance. */
  principalExclusion: number;
  /** Finance charges to strip from daily spend (avoids double-counting after principal exclusion). */
  financeChargeByDay: DailySpendMap;
};

/** True when the BT is still within its 0% / promo window. */
export function isBalanceTransferPromoActive(
  row: {
    dueDate?: string | null;
    btStartDate?: string | null;
    tenureMonths?: number | null;
  },
  asOfDate: string
): boolean {
  const due = row.dueDate ? String(row.dueDate).slice(0, 10) : "";
  if (due) return asOfDate <= due;
  // No promo end date — treat as interest-free (matches card-linking behaviour).
  return true;
}

function mapBtRow(row: BtRow) {
  return {
    outstanding: Number(row.outstanding ?? 0),
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : undefined,
    btStartDate: row.bt_start_date ? String(row.bt_start_date).slice(0, 10) : undefined,
    tenureMonths:
      row.tenure_months == null ? undefined : Number(row.tenure_months),
    financeCharge: Number(row.finance_charge ?? 0),
  };
}

/** Load BT amounts on a card that should not accrue card APR during the promo period. */
export async function loadBalanceTransferInterestExclusion(
  supabase: SupabaseClient,
  userId: string,
  creditCardUuid: string,
  asOfDate: string = sgtTodayYmd()
): Promise<BalanceTransferInterestExclusion> {
  const { data, error } = await supabase
    .from("other_loans")
    .select("outstanding, due_date, bt_start_date, tenure_months, finance_charge")
    .eq("user_id", userId)
    .eq("loan_type", "balance_transfer")
    .eq("source_credit_card_id", creditCardUuid)
    .is("paid_at", null);

  if (error) {
    console.error("[interest-free] load BT failed", error.message);
    return { principalExclusion: 0, financeChargeByDay: {} };
  }

  let principalExclusion = 0;
  const financeChargeByDay: DailySpendMap = {};

  for (const raw of data ?? []) {
    const row = mapBtRow(raw);
    if (row.outstanding <= 0 && row.financeCharge <= 0) continue;
    if (!isBalanceTransferPromoActive(row, asOfDate)) continue;

    principalExclusion += row.outstanding;
    if (row.financeCharge > 0) {
      principalExclusion += row.financeCharge;
      if (row.btStartDate) {
        financeChargeByDay[row.btStartDate] = roundMoney(
          (financeChargeByDay[row.btStartDate] ?? 0) + row.financeCharge
        );
      }
    }
  }

  principalExclusion = roundMoney(principalExclusion);

  if (principalExclusion > 0) {
    console.info("[interest-free] excluded BT from interest", {
      creditCardUuid,
      asOfDate,
      principalExclusion,
      financeChargeDays: Object.keys(financeChargeByDay),
    });
  }

  return { principalExclusion, financeChargeByDay };
}

/** Sum BT outstanding on a card that is still within the 0% / promo period. */
export async function interestFreeBalanceTransferPrincipal(
  supabase: SupabaseClient,
  userId: string,
  creditCardUuid: string,
  asOfDate: string = sgtTodayYmd()
): Promise<number> {
  const { principalExclusion } = await loadBalanceTransferInterestExclusion(
    supabase,
    userId,
    creditCardUuid,
    asOfDate
  );
  return principalExclusion;
}

export function subtractBtFinanceChargesFromDailySpend(
  dailySpend: DailySpendMap,
  financeChargeByDay: DailySpendMap
): DailySpendMap {
  if (Object.keys(financeChargeByDay).length === 0) return dailySpend;

  const out: DailySpendMap = { ...dailySpend };
  for (const [day, charge] of Object.entries(financeChargeByDay)) {
    if (!(charge > 0)) continue;
    const next = roundMoney((out[day] ?? 0) - charge);
    if (next <= 0) delete out[day];
    else out[day] = next;
  }
  return out;
}
