import type { CalendarEvent } from "@/lib/finance/calendar";
import { roundMoney } from "@/lib/cards/interest-accrual";
import {
  amountForPaymentDue,
  resolveAmountForClose,
  type CardStatementAmountEntry,
} from "@/lib/credit-cards/card-statements/calendar-amounts";
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
  creditCardId?: string;
  name: string;
  statementDay: number;
  paymentDueDay: number;
};

/**
 * Project statement close + payment due for `viewYm` from card billing days.
 * Payment due in a month applies to the prior month's statement close.
 */
function resolvePaymentDueAmount(
  creditCardId: string,
  paymentDueYmd: string,
  priorStatementClose: string,
  cardEntries: CardStatementAmountEntry[],
  amountsByCloseDate: Map<string, number | null>
): number | null {
  return (
    amountForPaymentDue(cardEntries, creditCardId, paymentDueYmd) ??
    resolveAmountForClose(amountsByCloseDate, priorStatementClose)
  );
}

export function projectCardCalendarCyclesForMonth(
  card: CardBillingSchedule,
  viewYm: string,
  amountsByCloseDate: Map<string, number | null> = new Map(),
  cardEntries: CardStatementAmountEntry[] = []
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
      actualAmount: resolveAmountForClose(amountsByCloseDate, statementCloseDate),
    });
  }

  if (paymentDueInMonth.startsWith(`${viewYm}-`)) {
    cycles.push({
      cardName: card.name,
      statementCloseDate: priorStatementClose,
      paymentDueDate: paymentDueInMonth,
      actualAmount: card.creditCardId
        ? resolvePaymentDueAmount(
            card.creditCardId,
            paymentDueInMonth,
            priorStatementClose,
            cardEntries,
            amountsByCloseDate
          )
        : resolveAmountForClose(amountsByCloseDate, priorStatementClose),
    });
  }

  return cycles;
}

function dayInYm(ymd: string, viewYm: string): number | null {
  if (!ymd.startsWith(`${viewYm}-`)) return null;
  const day = parseInt(ymd.slice(8, 10), 10);
  return Number.isFinite(day) ? day : null;
}

type CardNameLookup = { id: string; name: string };

/** Statement close + payment due events for cycles touching `viewYm`. */
export function getCardCalendarEvents(
  viewYm: string,
  cycles: CardCalendarCycle[],
  entries: CardStatementAmountEntry[] = [],
  cards: CardNameLookup[] = []
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const seenStmt = new Set<string>();
  const seenPay = new Set<string>();
  const nameById = new Map(cards.map((c) => [c.id, c.name]));
  const amountByDueKey = new Map<string, number>();
  for (const e of entries) {
    if (!e.paymentDueDate.startsWith(`${viewYm}-`)) continue;
    if (e.actualAmount == null || e.actualAmount <= 0) continue;
    const name = nameById.get(e.creditCardId) ?? "";
    if (!name) continue;
    amountByDueKey.set(`${name}:${e.paymentDueDate}`, e.actualAmount);
  }

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
        const fromDb = amountByDueKey.get(`${c.cardName}:${c.paymentDueDate}`);
        const amount = fromDb ?? c.actualAmount;
        if (amount != null && amount > 0) {
          ev.amount = amount;
        }
        events.push(ev);
      }
    }
  }

  return events;
}

/**
 * Total statement amounts for cycles that **close** in `viewYm` (payment due next month).
 */
export function sumStatementBalancesClosedInMonth(
  viewYm: string,
  entries: CardStatementAmountEntry[]
): number {
  const seen = new Set<string>();
  let sum = 0;
  for (const e of entries) {
    if (!e.statementCloseDate.startsWith(`${viewYm}-`)) continue;
    if (e.actualAmount == null || e.actualAmount <= 0) continue;
    const key = `${e.creditCardId}:${e.statementCloseDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sum += e.actualAmount;
  }
  return roundMoney(sum);
}

/** Same as {@link sumStatementBalancesClosedInMonth} using projected calendar cycles. */
export function sumStatementBalancesFromCycles(
  viewYm: string,
  cycles: CardCalendarCycle[]
): number {
  const seen = new Set<string>();
  let sum = 0;
  for (const c of cycles) {
    if (!c.statementCloseDate.startsWith(`${viewYm}-`)) continue;
    if (c.actualAmount == null || c.actualAmount <= 0) continue;
    const key = `${c.cardName}:${c.statementCloseDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sum += c.actualAmount;
  }
  return roundMoney(sum);
}
