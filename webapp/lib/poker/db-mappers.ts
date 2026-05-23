import type { PokerSession } from "@/lib/poker/types";

export function mapPokerSession(row: Record<string, unknown>): PokerSession {
  const hoursRaw = row.hours;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    playedAt: String(row.played_at),
    buyIn: Number(row.buy_in ?? 0),
    cashOut: Number(row.cash_out ?? 0),
    venue: String(row.venue ?? ""),
    hours: hoursRaw == null ? null : Number(hoursRaw),
    note: String(row.note ?? ""),
    createdAt: String(row.created_at),
  };
}
