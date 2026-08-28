/** Date helpers for card statement cycles (UTC calendar dates as YYYY-MM-DD). */

export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Clamp `day` into month (e.g. day 31 in Feb → last day of Feb). */
export function clampDayInMonth(year: number, monthIndex: number, day: number): string {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const d = Math.min(Math.max(1, day), last);
  return formatYmd(new Date(Date.UTC(year, monthIndex, d)));
}

export function addDaysYmd(ymd: string, delta: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + delta);
  return formatYmd(d);
}

export function addMonthsYmd(ymd: string, months: number): string {
  const d = parseYmd(ymd);
  const targetMonth = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  const year = d.getUTCFullYear() + Math.floor(targetMonth / 12);
  const monthIndex = ((targetMonth % 12) + 12) % 12;
  return clampDayInMonth(year, monthIndex, day);
}

/**
 * Statement close one cycle before `closeDate`, re-clamping the card's canonical
 * `statementDay` into the previous month — NOT shifting `closeDate` by its own
 * day-of-month. `closeDate` may already be clamped (e.g. Feb 28 for statementDay
 * 31), and shifting from a clamped day would silently degrade the day forever
 * (Feb 28 - 1 month → Jan 28, instead of the correct Jan 31), producing
 * overlapping cycle ranges for statement days 29–31.
 */
function previousStatementClose(closeDate: string, statementDay: number): string {
  const d = parseYmd(closeDate);
  let monthIndex = d.getUTCMonth() - 1;
  let year = d.getUTCFullYear();
  if (monthIndex < 0) {
    monthIndex = 11;
    year -= 1;
  }
  return clampDayInMonth(year, monthIndex, statementDay);
}

/**
 * Billing cycle for a statement that closes on `statementCloseDate` (statement day).
 * Spend counts from the day after the previous close through the close date inclusive
 * (e.g. statement day 21 → Apr 22 … May 21).
 */
export function cycleBoundsFromClose(
  statementCloseDate: string,
  statementDay: number
): { cycleStart: string; cycleEnd: string } {
  const cycleEnd = statementCloseDate;
  const previousClose = previousStatementClose(statementCloseDate, statementDay);
  const cycleStart = addDaysYmd(previousClose, 1);
  return { cycleStart, cycleEnd };
}

/** Payment due = `paymentDueDay` in the month after the statement close month. */
export function paymentDueDate(statementCloseDate: string, paymentDueDay: number): string {
  const close = parseYmd(statementCloseDate);
  let year = close.getUTCFullYear();
  let monthIndex = close.getUTCMonth() + 1;
  if (monthIndex > 11) {
    monthIndex = 0;
    year += 1;
  }
  return clampDayInMonth(year, monthIndex, paymentDueDay);
}

/** Open cycle containing `asOfDate`. */
export function openCycleBounds(
  statementDay: number,
  asOfDate: string
): { cycleStart: string; cycleEnd: string; statementClose: string } {
  const statementClose = statementCloseForSpend(asOfDate, statementDay);
  const { cycleStart, cycleEnd } = cycleBoundsFromClose(statementClose, statementDay);
  return { cycleStart, cycleEnd, statementClose };
}

/** Assign expense `spentAt` to the statement close date for its cycle. */
export function statementCloseForSpend(
  spentAt: string,
  statementDay: number
): string {
  const d = parseYmd(spentAt);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const dom = d.getUTCDate();

  let closeYear = y;
  let closeMonth = m;
  if (dom > statementDay) {
    closeMonth += 1;
    if (closeMonth > 11) {
      closeMonth = 0;
      closeYear += 1;
    }
  }

  return clampDayInMonth(closeYear, closeMonth, statementDay);
}

/** Last `count` statement close dates on or before `asOfDate`, newest first. */
export function recentStatementCloseDates(
  statementDay: number,
  count: number,
  asOfDate: string
): string[] {
  const { statementClose: currentClose } = openCycleBounds(statementDay, asOfDate);
  const out: string[] = [];
  let close = currentClose;

  const d = parseYmd(asOfDate);
  const closeD = parseYmd(close);
  if (closeD > d) {
    close = previousStatementClose(close, statementDay);
  }

  for (let i = 0; i < count; i++) {
    out.push(close);
    close = previousStatementClose(close, statementDay);
  }
  return out;
}

export function isDateInRange(
  ymd: string,
  start: string,
  end: string
): boolean {
  return ymd >= start && ymd <= end;
}

/** Statement appears in the closed table on its statement close date (inclusive). */
export function isStatementClosed(
  statementCloseDate: string,
  asOfDate: string
): boolean {
  return statementCloseDate <= asOfDate;
}

/** Earliest statement day across cards — batch unlocks for all cards on this day each month. */
export function earliestStatementDay(statementDays: number[]): number {
  if (statementDays.length === 0) return 1;
  return Math.min(...statementDays);
}

export function statementBatchUnlockDateForMonth(
  year: number,
  monthIndex: number,
  earliestStatementDay: number
): string {
  return clampDayInMonth(year, monthIndex, earliestStatementDay);
}

/**
 * Calendar month whose statement batch is shown in the statements table.
 * Unlocks on the earliest statement day each month for all cards together.
 */
export function activeStatementBatchMonth(
  today: string,
  earliestStatementDay: number
): { year: number; monthIndex: number } {
  const d = parseYmd(today);
  let year = d.getUTCFullYear();
  let monthIndex = d.getUTCMonth();
  const unlock = statementBatchUnlockDateForMonth(
    year,
    monthIndex,
    earliestStatementDay
  );
  if (today < unlock) {
    monthIndex -= 1;
    if (monthIndex < 0) {
      monthIndex = 11;
      year -= 1;
    }
  }
  return { year, monthIndex };
}

/** Statement close date for a card in the active batch month (0 = current batch). */
export function targetStatementCloseForBatch(
  cardStatementDay: number,
  today: string,
  earliestStatementDay: number,
  batchOffset = 0
): string {
  const active = activeStatementBatchMonth(today, earliestStatementDay);
  const { year, monthIndex } = shiftBatchMonth(
    active.year,
    active.monthIndex,
    batchOffset
  );
  return clampDayInMonth(year, monthIndex, cardStatementDay);
}

function shiftBatchMonth(
  year: number,
  monthIndex: number,
  batchOffset: number
): { year: number; monthIndex: number } {
  let y = year;
  let m = monthIndex - batchOffset;
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  while (m > 11) {
    m -= 12;
    y += 1;
  }
  return { year: y, monthIndex: m };
}

/** Display label for the statement batch month shown in the table (e.g. "June 2026"). */
export function statementBatchMonthLabel(
  today: string,
  earliestStatementDay: number,
  batchOffset = 0
): string {
  const active = activeStatementBatchMonth(today, earliestStatementDay);
  const { year, monthIndex } = shiftBatchMonth(
    active.year,
    active.monthIndex,
    batchOffset
  );
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString("en-SG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
