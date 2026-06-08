const SGT_TIMEZONE = "Asia/Singapore";

export function sgtParts(now: Date = new Date()): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** HH:mm:ss wall clock in Singapore. */
export function sgtNowTimeHms(now?: Date): string {
  const p = sgtParts(now);
  return `${p.hour}:${p.minute}:${p.second}`;
}

export function normalizeSpentTimeHms(spentTime: string): string {
  const t = spentTime.trim();
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  return "00:00:00";
}

/** Combine spent date/time (entered as SGT) into an ISO instant. */
export function sgtSpentAtToIso(spentAt: string, spentTime: string): string {
  const date = spentAt.slice(0, 10);
  return `${date}T${normalizeSpentTimeHms(spentTime)}+08:00`;
}

/**
 * Normalize any parseable ISO instant (UTC `Z`, offset, or SGT +08:00) to a single
 * SGT wall-clock sort key used across transaction history.
 */
export function isoInstantToSgtSortAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    console.warn("[sgt] invalid iso for sortAt", { iso });
    return iso;
  }
  const p = sgtParts(d);
  const hour = String(Number(p.hour) % 24).padStart(2, "0");
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}+08:00`;
}

/** Newest-first compare for unified transaction history (parses real instants). */
export function compareSgtSortAtDescending(a: string, b: string): number {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) {
    return a < b ? 1 : a > b ? -1 : 0;
  }
  return tb - ta;
}

/** YYYY-MM-DD in Singapore time (UTC+8). */
export function sgtTodayYmd(now?: Date): string {
  const p = sgtParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** YYYY-MM-DDTHH:mm for datetime-local inputs in Singapore time. */
export function sgtNowInputDateTime(now?: Date): string {
  const p = sgtParts(now);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** YYYY-MM-DD in Singapore time for N days ago (0 = today). */
export function sgtYmdDaysAgo(daysAgo: number, now: Date = new Date()): string {
  const ms = Math.max(0, Math.floor(daysAgo)) * 86400000;
  return sgtTodayYmd(new Date(now.getTime() - ms));
}

