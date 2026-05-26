import type { CalendarEvent } from "@/lib/finance/calendar";
import {
  clampDayInMonth,
  paymentDueDate,
} from "@/lib/cards/statement-cycle";

/** One billing cycle row for the month calendar (from card_statements). */
export type CardCalendarCycle = {
  cardName: string;
  statementCloseDate: string;
  paymentDueDate: string;
  actualAmount: number | null;
};

export type CardBillingSchedule = {
  name: string;
  statementDay: number;
  paymentDueDay: number;
};

/**
 * Project statement close + payment due for `viewYm` from card billing days.
 * Payment due in a month applies to the prior month's statement close.
 */
export function projectCardCalendarCyclesForMonth(
  card: CardBillingSchedule,
  viewYm: string,
  amountsByCloseDate: Map<string, number | null> = new Map()
): CardCalendarCycle[] {
  const [y, m] = viewYm.split("-").map(Number);
  const monthIndex = m - 1;

  const statementCloseDate = clampDayInMonth(y, monthIndex, card.statementDay);

  let prevY = y;
  let prevMonthIndex = monthIndex - 1;
  if (prevMonthIndex < 0) {
    prevMonthIndex = 11;
    prevY -= 1;
  }
  const priorStatementClose = clampDayInMonth(
    prevY,
    prevMonthIndex,
    card.statementDay
  );
  const paymentDueInMonth = paymentDueDate(
    priorStatementClose,
    card.paymentDueDay
  );

  const cycles: CardCalendarCycle[] = [];

  if (statementCloseDate.startsWith(`${viewYm}-`)) {
    cycles.push({
      cardName: card.name,
      statementCloseDate,
      paymentDueDate: paymentDueDate(statementCloseDate, card.paymentDueDay),
      actualAmount: amountsByCloseDate.get(statementCloseDate) ?? null,
    });
  }

  if (paymentDueInMonth.startsWith(`${viewYm}-`)) {
    cycles.push({
      cardName: card.name,
      statementCloseDate: priorStatementClose,
      paymentDueDate: paymentDueInMonth,
      actualAmount: amountsByCloseDate.get(priorStatementClose) ?? null,
    });
  }

  return cycles;
}

function dayInYm(ymd: string, viewYm: string): number | null {
  if (!ymd.startsWith(`${viewYm}-`)) return null;
  const day = parseInt(ymd.slice(8, 10), 10);
  return Number.isFinite(day) ? day : null;
}

/** Statement close + payment due events for cycles touching `viewYm`. */
export function getCardCalendarEvents(
  viewYm: string,
  cycles: CardCalendarCycle[]
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const seenStmt = new Set<string>();
  const seenPay = new Set<string>();

  for (const c of cycles) {
    const stmtDay = dayInYm(c.statementCloseDate, viewYm);
    if (stmtDay != null) {
      const key = `s:${c.cardName}:${c.statementCloseDate}`;
      if (!seenStmt.has(key)) {
        seenStmt.add(key);
        events.push({
          day: stmtDay,
          type: "statement",
          label: `${c.cardName} — statement`,
        });
      }
    }

    const payDay = dayInYm(c.paymentDueDate, viewYm);
    if (payDay != null) {
      const key = `p:${c.cardName}:${c.paymentDueDate}`;
      if (!seenPay.has(key)) {
        seenPay.add(key);
        const ev: CalendarEvent = {
          day: payDay,
          type: "payment",
          label: `${c.cardName} — payment due`,
        };
        if (c.actualAmount != null && c.actualAmount > 0) {
          ev.amount = c.actualAmount;
        }
        events.push(ev);
      }
    }
  }

  return events;
}

/** Sum of statement amounts entered on the Credit Cards tab (latest closed cycles). */
export function sumEnteredStatementAmounts(
  cycles: { actualAmount: number | null }[]
): number {
  return cycles.reduce(
    (s, c) => s + (c.actualAmount != null && c.actualAmount > 0 ? c.actualAmount : 0),
    0
  );
}
