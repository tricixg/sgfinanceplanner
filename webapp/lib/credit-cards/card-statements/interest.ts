import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import {
  accrueDailyInterest,
  interestStartAfterDue,
  principalAtDue,
  todayYmd,
} from "@/lib/cards/interest-accrual";
import { sumCardSpendByDay } from "@/lib/cards/statement-spend";
import type { DbCardStatement } from "./mappers";

export async function recomputeInterestForStatement(
  supabase: SupabaseClient,
  userId: string,
  card: DbCreditCard,
  stmt: DbCardStatement
): Promise<number> {
  const today = todayYmd();
  const financialAccountId = card.financialAccountId;
  if (card.interestRateApr <= 0 || !financialAccountId) return stmt.interestAccrued;
  if (stmt.paidAt) return 0;

  const principal = principalAtDue({
    carriedForwardIn: stmt.carriedForwardIn,
    actualAmount: stmt.actualAmount,
    amountPaid: stmt.amountPaid,
  });

  if (principal <= 0 || today <= stmt.paymentDueDate) {
    return 0;
  }

  const start = interestStartAfterDue(stmt.paymentDueDate);
  const dailySpend = await sumCardSpendByDay(
    supabase,
    userId,
    financialAccountId,
    start,
    today
  );

  const interest = accrueDailyInterest({
    aprPercent: card.interestRateApr,
    principalAtDue: principal,
    dailySpend,
    interestStartDate: start,
    throughDate: today,
  });

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
