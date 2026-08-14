import type { CardStatementAmountEntry } from "@/lib/credit-cards/card-statements/calendar-amounts";
import type {
  DashboardState,
  RecurringInvestment,
  RecurringSubscription,
} from "@/lib/types";
import {
  getCardCalendarEvents,
  type CardCalendarCycle,
} from "@/lib/finance/calendar-cards";
import { creditCardLabel } from "./card-linking";
import { stableTakeHome } from "./cashflow";
import { getRecurringCalendarEvents } from "@/lib/recurring/calendar-events";
import { clampDay, effectiveCalendarDay, formatMonthLabel } from "./helpers";

export type { CardCalendarCycle } from "@/lib/finance/calendar-cards";

export type CalendarEventType = "salary" | "statement" | "payment" | "loan_end" | "recurring";

export type CalendarEvent = {
  day: number;
  type: CalendarEventType;
  label: string;
  detail?: string;
  amount?: number;
};

export type CalendarDayCell = {
  date: Date;
  inMonth: boolean;
  events: CalendarEvent[];
};

function parseYm(viewYm: string): { year: number; month: number } {
  const [y, m] = viewYm.split("-").map(Number);
  return { year: y, month: m - 1 };
}

type CalendarCardRef = { id: string; name: string };

export function getCalendarEvents(
  S: DashboardState,
  viewYm: string,
  subscriptions: RecurringSubscription[] = [],
  cardCycles: CardCalendarCycle[] | null = null,
  statementEntries: CardStatementAmountEntry[] = [],
  calendarCards: CalendarCardRef[] = [],
  investments: RecurringInvestment[] = []
): CalendarEvent[] {
  const { year, month } = parseYm(viewYm);
  const events: CalendarEvent[] = [];
  const takeHome = stableTakeHome(S);

  const salDay = effectiveCalendarDay(S.salaryCreditDay, viewYm);
  events.push({
    day: salDay,
    type: "salary",
    label: "Salary credit",
    detail: formatMonthLabel(viewYm),
    amount: takeHome,
  });

  if (cardCycles !== null) {
    events.push(
      ...getCardCalendarEvents(viewYm, cardCycles, statementEntries, calendarCards)
    );
  } else {
    for (const card of S.creditCards) {
      const stmtDay = clampDay(year, month, card.statementDay);
      events.push({
        day: stmtDay,
        type: "statement",
        label: `${card.name} — statement`,
      });
      const payDay = clampDay(year, month, card.paymentDueDay);
      events.push({
        day: payDay,
        type: "payment",
        label: `${card.name} — payment due`,
      });
    }
  }

  for (const loan of S.loans) {
    if (loan.end === viewYm) {
      const day = clampDay(year, month, 1);
      events.push({
        day,
        type: "loan_end",
        label: `${loan.name} ends`,
        detail: creditCardLabel(S.creditCards, loan.cardId) || loan.card,
      });
    }
  }

  events.push(...getRecurringCalendarEvents(S, viewYm, subscriptions, investments));

  events.sort((a, b) => a.day - b.day);
  console.log("[getCalendarEvents]", viewYm, events.length);
  return events;
}

export function buildMonthGrid(viewYm: string): CalendarDayCell[] {
  const { year, month } = parseYm(viewYm);
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarDayCell[] = [];

  for (let i = 0; i < startPad; i++) {
    const d = new Date(year, month, -startPad + i + 1);
    cells.push({ date: d, inMonth: false, events: [] });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: new Date(year, month, day),
      inMonth: true,
      events: [],
    });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const d = new Date(last);
    d.setDate(d.getDate() + 1);
    cells.push({ date: d, inMonth: false, events: [] });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const d = new Date(last);
    d.setDate(d.getDate() + 1);
    cells.push({ date: d, inMonth: false, events: [] });
  }

  return cells;
}

export function attachEventsToGrid(
  grid: CalendarDayCell[],
  events: CalendarEvent[]
): CalendarDayCell[] {
  return grid.map((cell) => {
    if (!cell.inMonth) return cell;
    const day = cell.date.getDate();
    return {
      ...cell,
      events: events.filter((e) => e.day === day),
    };
  });
}

export function addMonthsYm(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Whole days from one "YYYY-MM-DD" to another (negative if `toYmd` is earlier). */
export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const parse = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(toYmd) - parse(fromYmd)) / 86400000);
}

export function totalStatementAmount(
  S: DashboardState,
  enteredStatementAmounts?: number[] | null
): number {
  if (enteredStatementAmounts != null) {
    return enteredStatementAmounts.reduce(
      (s, n) => s + (Number.isFinite(n) && n > 0 ? n : 0),
      0
    );
  }
  return S.creditCards.reduce((s, c) => s + c.statementAmount, 0);
}
