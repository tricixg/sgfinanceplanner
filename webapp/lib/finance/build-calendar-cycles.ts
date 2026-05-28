import {
  amountsByCloseForCard,
  type CardStatementAmountEntry,
} from "@/lib/credit-cards/card-statements/calendar-amounts";
import {
  projectCardCalendarCyclesForMonth,
  type CardCalendarCycle,
} from "@/lib/finance/calendar-cards";
/** Card billing row from DB (id is credit_cards UUID, not cardKey). */
export type CalendarCardSchedule = {
  id: string;
  cardKey: string;
  name: string;
  statementDay: number;
  paymentDueDay: number;
};

export function buildCardCyclesForMonth(
  cards: CalendarCardSchedule[],
  viewYm: string,
  entries: CardStatementAmountEntry[]
): CardCalendarCycle[] {
  const cycles: CardCalendarCycle[] = [];

  for (const card of cards) {
    const cardEntries = entries.filter((e) => e.creditCardId === card.id);
    cycles.push(
      ...projectCardCalendarCyclesForMonth(
        {
          creditCardId: card.id,
          name: card.name,
          statementDay: card.statementDay,
          paymentDueDay: card.paymentDueDay,
        },
        viewYm,
        amountsByCloseForCard(entries, card.id),
        cardEntries
      )
    );
  }

  return cycles;
}
