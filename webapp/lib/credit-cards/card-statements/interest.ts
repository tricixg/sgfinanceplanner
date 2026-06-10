import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import {
  accrueDailyInterest,
  interestStartAfterDue,
  principalAtDue,
} from "@/lib/cards/interest-accrual";
import type { CardSpendIndex } from "@/lib/cards/statement-spend-index";
import { sumCardSpendByDay } from "@/lib/cards/statement-spend";
import {
  loadBalanceTransferInterestExclusion,
  subtractBtFinanceChargesFromDailySpend,
} from "@/lib/other-loans/interest-free";
import { sgtTodayYmd } from "@/lib/time/sgt";
import type { DbCardStatement } from "./mappers";

export async function estimateInterestAfterDue(
  supabase: SupabaseClient,
  userId: string,
  card: DbCreditCard,
  stmt: DbCardStatement,
  spendIndex: CardSpendIndex | null | undefined,
  throughDate: string = sgtTodayYmd()
): Promise<number> {
  const financialAccountId = card.financialAccountId;
  if (card.interestRateApr <= 0 || !financialAccountId) return 0;
  if (stmt.paidAt) return 0;
  if (throughDate <= stmt.paymentDueDate) return 0;

  let principal = principalAtDue({
    carriedForwardIn: stmt.carriedForwardIn,
    actualAmount: stmt.actualAmount,
    amountPaid: stmt.amountPaid,
  });

  const btExcl = await loadBalanceTransferInterestExclusion(
    supabase,
    userId,
    card.id,
    throughDate
  );
  principal = Math.max(0, principal - btExcl.principalExclusion);

  const start = interestStartAfterDue(stmt.paymentDueDate);
  let dailySpend = spendIndex
    ? spendIndex.dailySpendInRange(start, throughDate)
    : await sumCardSpendByDay(supabase, userId, financialAccountId, start, throughDate);

  dailySpend = subtractBtFinanceChargesFromDailySpend(
    dailySpend,
    btExcl.financeChargeByDay
  );

  return accrueDailyInterest({
    aprPercent: card.interestRateApr,
    principalAtDue: principal,
    dailySpend,
    interestStartDate: start,
    throughDate,
  });
}

export async function recomputeInterestForStatement(
  supabase: SupabaseClient,
  userId: string,
  card: DbCreditCard,
  stmt: DbCardStatement,
  spendIndex?: CardSpendIndex | null
): Promise<number> {
  if (card.interestRateApr <= 0 || !card.financialAccountId) return stmt.interestAccrued;
  if (stmt.paidAt) return 0;

  const interest = await estimateInterestAfterDue(
    supabase,
    userId,
    card,
    stmt,
    spendIndex,
    sgtTodayYmd()
  );

  if (interest !== stmt.interestAccrued) {
    await supabase
      .from("card_statements")
      .update({
        interest_accrued: interest,
        updated_at: new Date().toISOString(),
      })
      .eq("id", stmt.id);
    console.info("[card-statements] interest updated", {
      statementId: stmt.id,
      interest,
    });
  }

  return interest;
}
