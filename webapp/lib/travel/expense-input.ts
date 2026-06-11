import {
  formatTransactionDate,
  formatTransactionTime,
} from "@/lib/savings/format-transaction-when";
import {
  normalizeSpentTimeHms,
  sgtNowTimeHms,
  sgtSpentAtToIso,
  sgtTodayYmd,
} from "@/lib/time/sgt";

/** Parse datetime-local (SGT) or YYYY-MM-DD into expense date + time columns. */
export function parseTravelSpentAtInput(input: string | undefined): {
  spentAt: string;
  spentTime: string;
} {
  const v = (input ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
    const [spentAt, timePart] = v.split("T");
    return { spentAt, spentTime: normalizeSpentTimeHms(timePart) };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return { spentAt: v, spentTime: "00:00:00" };
  }
  return { spentAt: sgtTodayYmd(), spentTime: sgtNowTimeHms() };
}

export function travelSpentAtToInput(
  spentAt: string,
  spentTime: string | null | undefined
): string {
  const date = spentAt.slice(0, 10);
  if (spentTime && /^\d{2}:\d{2}/.test(spentTime)) {
    return `${date}T${spentTime.slice(0, 5)}`;
  }
  return `${date}T12:00`;
}

export function formatTravelSpentAtDisplay(
  spentAt: string,
  spentTime: string | null | undefined
): string {
  const iso = sgtSpentAtToIso(spentAt.slice(0, 10), spentTime ?? "00:00:00");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return spentAt;
  return d.toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Date/time columns aligned with transaction history tables. */
export function formatTravelSpentAtTable(
  spentAt: string,
  spentTime: string | null | undefined
): { date: string; time: string } {
  const iso = sgtSpentAtToIso(spentAt.slice(0, 10), spentTime ?? "00:00:00");
  return {
    date: formatTransactionDate(iso),
    time: formatTransactionTime(iso),
  };
}
