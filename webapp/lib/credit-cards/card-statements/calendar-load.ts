import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import type { CardCalendarCycle } from "@/lib/finance/calendar-cards";
import { ensureStatementRows } from "@/lib/credit-cards/card-statements/load";

function inViewYm(ymd: string, viewYm: string): boolean {
  return ymd.slice(0, 7) === viewYm;
}

export async function loadCardCalendarCycles(
  supabase: SupabaseClient,
  userId: string,
  cards: DbCreditCard[],
  viewYm: string
): Promise<CardCalendarCycle[]> {
  const cycles: CardCalendarCycle[] = [];

  for (const card of cards) {
    const rows = await ensureStatementRows(supabase, userId, card);
    for (const row of rows) {
      if (
        !inViewYm(row.statementCloseDate, viewYm) &&
        !inViewYm(row.paymentDueDate, viewYm)
      ) {
        continue;
      }
      cycles.push({
        cardName: card.name,
        statementCloseDate: row.statementCloseDate,
        paymentDueDate: row.paymentDueDate,
        actualAmount: row.actualAmount,
      });
    }
  }

  console.info("[card-statements] calendar cycles", {
    userId,
    viewYm,
    cycles: cycles.length,
  });

  return cycles;
}
