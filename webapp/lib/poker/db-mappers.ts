import type { PokerGame, PokerSession, PokerSessionType, TournamentResult } from "@/lib/poker/types";

function mapPokerGame(row: Record<string, unknown> | null | undefined): PokerGame | null {
  if (!row || row.id == null) return null;
  const anteRaw = row.ante;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? ""),
    smallBlind: Number(row.small_blind ?? 0),
    bigBlind: Number(row.big_blind ?? 0),
    ante: anteRaw == null ? null : Number(anteRaw),
    createdAt: String(row.created_at),
  };
}

export function mapPokerSession(row: Record<string, unknown>): PokerSession {
  const hoursRaw = row.hours;
  const sessionType = String(row.session_type ?? "cash_game") as PokerSessionType;
  const resultRaw = row.tournament_result;
  const tournamentResult =
    resultRaw === "placed" || resultRaw === "busted"
      ? (resultRaw as TournamentResult)
      : null;
  const amountWonRaw = row.amount_won;
  const gameRow = row.poker_games as Record<string, unknown> | null | undefined;

  const location = String(row.location ?? row.venue ?? "");

  return {
    id: String(row.id),
    userId: String(row.user_id),
    sessionType: sessionType === "tournament" ? "tournament" : "cash_game",
    playedAt: String(row.played_at),
    buyIn: Number(row.buy_in ?? 0),
    cashOut: Number(row.cash_out ?? 0),
    location,
    tournamentName: row.tournament_name ? String(row.tournament_name) : null,
    gameId: row.game_id ? String(row.game_id) : null,
    game: mapPokerGame(gameRow),
    eventName: row.event_name ? String(row.event_name) : null,
    tournamentResult,
    tournamentPlace:
      row.tournament_place == null ? null : Number(row.tournament_place),
    tournamentEntries:
      row.tournament_entries == null ? null : Number(row.tournament_entries),
    amountWon: amountWonRaw == null ? null : Number(amountWonRaw),
    rebuyAmount: Number(row.rebuy_amount ?? 0),
    bountyAmount: Number(row.bounty_amount ?? 0),
    hours: hoursRaw == null ? null : Number(hoursRaw),
    note: String(row.note ?? ""),
    currency: String(row.currency ?? "SGD").toUpperCase(),
    fxRateToSgd: Number(row.fx_rate_to_sgd ?? 1),
    fxRateManual: Boolean(row.fx_rate_manual),
    financialAccountId: row.financial_account_id
      ? String(row.financial_account_id)
      : null,
    savingsTransactionId: row.savings_transaction_id
      ? String(row.savings_transaction_id)
      : null,
    createdAt: String(row.created_at),
  };
}

export function mapPokerGameRow(row: Record<string, unknown>): PokerGame {
  const mapped = mapPokerGame(row);
  if (!mapped) throw new Error("Invalid poker game row");
  return mapped;
}
