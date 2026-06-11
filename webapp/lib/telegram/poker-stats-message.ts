import type { SupabaseClient } from "@supabase/supabase-js";
import { currentYm } from "@/lib/finance/helpers";
import { mapPokerSession } from "@/lib/poker/db-mappers";
import { formatPokerPlayedAtDisplay } from "@/lib/poker/played-at";
import { pokerProfitSgd } from "@/lib/fx/convert";
import type { PokerSession } from "@/lib/poker/types";
import { sessionGameLabel } from "@/lib/poker/types";
import { fmtMoney, truncateLabel } from "@/lib/telegram/format";

function sgtMonthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map((x) => Number(x));
  const from = `${ym}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${ym}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function formatYmLabel(ym: string): string {
  const [y, m] = ym.split("-").map((x) => Number(x));
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-SG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatPokerPl(value: number): string {
  if (value > 0) return `+${fmtMoney(value)}`;
  if (value < 0) return `−${fmtMoney(Math.abs(value))}`;
  return fmtMoney(0);
}

async function loadPokerSessionsInRange(
  supabase: SupabaseClient,
  userId: string,
  from: string,
  to: string
): Promise<PokerSession[]> {
  const { data, error } = await supabase
    .from("poker_sessions")
    .select("*, poker_games(*)")
    .eq("user_id", userId)
    .gte("played_at", `${from}T00:00:00+08:00`)
    .lte("played_at", `${to}T23:59:59+08:00`)
    .order("played_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    console.error("[telegram] poker stats month query failed", error.message);
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapPokerSession(r));
}

async function loadRecentPokerSessions(
  supabase: SupabaseClient,
  userId: string,
  limit: number
): Promise<PokerSession[]> {
  const { data, error } = await supabase
    .from("poker_sessions")
    .select("*, poker_games(*)")
    .eq("user_id", userId)
    .order("played_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[telegram] poker stats recent query failed", error.message);
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapPokerSession(r));
}

function sessionSummaryLine(session: PokerSession): string {
  const when = formatPokerPlayedAtDisplay(session.playedAt);
  const label = sessionGameLabel(session);
  const pl = formatPokerPl(pokerProfitSgd(session));
  const type = session.sessionType === "tournament" ? "MTT" : "Cash";
  return truncateLabel(`${when} · ${type} · ${label} — ${pl}`, 120);
}

export async function buildPokerStatsMessage(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const ym = currentYm();
  const { from, to } = sgtMonthBounds(ym);
  const [monthSessions, recentSessions] = await Promise.all([
    loadPokerSessionsInRange(supabase, userId, from, to),
    loadRecentPokerSessions(supabase, userId, 3),
  ]);

  const monthPl = monthSessions.reduce((s, x) => s + pokerProfitSgd(x), 0);
  const monthLabel = formatYmLabel(ym);

  console.info("[telegram] poker stats built", {
    userId,
    ym,
    monthSessions: monthSessions.length,
    monthPl,
    recentCount: recentSessions.length,
  });

  const lines: string[] = [
    "Poker stats",
    "",
    `This month (${monthLabel})`,
    `P/L: ${formatPokerPl(monthPl)}`,
    `Sessions: ${monthSessions.length}`,
    "",
    "Last 3 sessions",
  ];

  if (recentSessions.length === 0) {
    lines.push("No sessions logged yet.");
  } else {
    for (const s of recentSessions) {
      lines.push(`• ${sessionSummaryLine(s)}`);
    }
  }

  return lines.join("\n");
}
