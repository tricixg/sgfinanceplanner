import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import {
  projectCardCalendarCyclesForMonth,
  type CardCalendarCycle,
} from "@/lib/finance/calendar-cards";

export async function loadCardCalendarCycles(
  supabase: SupabaseClient,
  userId: string,
  cards: DbCreditCard[],
  viewYm: string
): Promise<CardCalendarCycle[]> {
  const cycles: CardCalendarCycle[] = [];

  for (const card of cards) {
    const { data: rows, error } = await supabase
      .from("card_statements")
      .select("statement_close_date, actual_amount")
      .eq("credit_card_id", card.id)
      .eq("user_id", userId);

    if (error) throw new Error(error.message);

    const amountsByClose = new Map<string, number | null>();
    for (const row of rows ?? []) {
      const close = String(row.statement_close_date).slice(0, 10);
      amountsByClose.set(
        close,
        row.actual_amount != null ? Number(row.actual_amount) : null
      );
    }

    cycles.push(
      ...projectCardCalendarCyclesForMonth(
        {
          name: card.name,
          statementDay: card.statementDay,
          paymentDueDay: card.paymentDueDay,
        },
        viewYm,
        amountsByClose
      )
    );
  }

  console.info("[card-statements] calendar cycles", {
    userId,
    viewYm,
    cycles: cycles.length,
  });

  return cycles;
}
