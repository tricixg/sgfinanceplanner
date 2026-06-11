import { sgtNowInputDateTime, sgtParts, sgtTodayYmd } from "@/lib/time/sgt";

const SGT_OFFSET = "+08:00";

/** Parse datetime-local (SGT) or legacy YYYY-MM-DD into an ISO instant for storage. */
export function parsePokerPlayedAtInput(input: string | undefined): string {
  const v = (input ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
    return `${v}:00${SGT_OFFSET}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return `${v}T00:00:00${SGT_OFFSET}`;
  }
  if (v.length >= 19 && v.includes("T")) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return `${sgtTodayYmd()}T00:00:00${SGT_OFFSET}`;
}

/** Value for `<input type="datetime-local" />` in Singapore time. */
export function pokerPlayedAtToInput(playedAt: string): string {
  const v = playedAt.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return `${v}T12:00`;
  }
  const d = new Date(v.includes("T") ? v : `${v}T12:00:00${SGT_OFFSET}`);
  if (Number.isNaN(d.getTime())) return sgtNowInputDateTime();
  return sgtNowInputDateTime(d);
}

export function pokerPlayedAtToLedgerIso(playedAt: string): string {
  const v = playedAt.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return `${v}T12:00:00.000Z`;
  }
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return parsePokerPlayedAtInput(v);
}

/** Calendar date (YYYY-MM-DD) in SGT for FX lookups. */
export function pokerPlayedAtYmd(playedAt: string): string {
  const v = playedAt.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    const p = sgtParts(d);
    return `${p.year}-${p.month}-${p.day}`;
  }
  return sgtTodayYmd();
}

/** YYYY-MM in Singapore for stats / month filters. */
export function ymFromPokerPlayedAt(playedAt: string): string {
  const d = new Date(pokerPlayedAtToLedgerIso(playedAt));
  const p = sgtParts(d);
  return `${p.year}-${p.month}`;
}

/** Parse date/time typed in Telegram (SGT). Accepts YYYY-MM-DD HH:mm or YYYY-MM-DDTHH:mm. */
export function parsePokerPlayedAtTelegram(text: string): string | null {
  let v = text.trim();
  const space = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/.exec(v);
  if (space) {
    v = `${space[1]}T${String(Number(space[2])).padStart(2, "0")}:${space[3]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) {
    return parsePokerPlayedAtInput(v);
  }
  return null;
}

export function formatPokerPlayedAtDisplay(playedAt: string): string {
  const d = new Date(pokerPlayedAtToLedgerIso(playedAt));
  if (Number.isNaN(d.getTime())) return playedAt;
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
