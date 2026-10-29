function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

const DAY = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DAY_NO_YEAR = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-SG", { month: "short", year: "numeric", timeZone: "UTC" });

/** "12 Oct 2026" */
export function fmtOncallDay(ymd: string): string {
  return ymd ? DAY.format(ymdToDate(ymd)) : "—";
}

/** "12 Oct – 18 Oct 2026", or with both years when the stretch crosses a year. */
export function fmtOncallRange(startDate: string, endDate: string): string {
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  return `${(sameYear ? DAY_NO_YEAR : DAY).format(ymdToDate(startDate))} – ${fmtOncallDay(endDate)}`;
}

/** "Oct 2026" from YYYY-MM. */
export function fmtSalaryMonth(ym: string): string {
  return ym ? MONTH.format(ymdToDate(`${ym}-01`)) : "—";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
