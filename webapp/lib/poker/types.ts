export type PokerSessionType = "cash_game" | "tournament";
export type TournamentResult = "placed" | "busted";

export type PokerGame = {
  id: string;
  userId: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  ante: number | null;
  createdAt: string;
};

export type PokerSession = {
  id: string;
  userId: string;
  sessionType: PokerSessionType;
  playedAt: string;
  buyIn: number;
  cashOut: number;
  location: string;
  tournamentName: string | null;
  gameId: string | null;
  game: PokerGame | null;
  eventName: string | null;
  tournamentResult: TournamentResult | null;
  tournamentPlace: number | null;
  tournamentEntries: number | null;
  amountWon: number | null;
  hours: number | null;
  note: string;
  financialAccountId: string | null;
  savingsTransactionId: string | null;
  createdAt: string;
};

export function pokerProfit(
  session: Pick<PokerSession, "buyIn" | "cashOut" | "sessionType" | "amountWon">
): number {
  if (session.sessionType === "tournament") {
    const won = session.amountWon ?? 0;
    return won - session.buyIn;
  }
  return session.cashOut - session.buyIn;
}

export function formatGameStakes(game: Pick<PokerGame, "name" | "smallBlind" | "bigBlind" | "ante">): string {
  const blinds = `${game.smallBlind}/${game.bigBlind}`;
  const ante =
    game.ante != null && game.ante > 0 ? ` · ante ${game.ante}` : "";
  return game.name.trim() ? `${game.name} (${blinds}${ante})` : `${blinds}${ante}`;
}

export function sessionGameLabel(session: PokerSession): string {
  if (session.sessionType === "tournament") {
    return session.eventName?.trim() || session.tournamentName?.trim() || "—";
  }
  if (session.game) return formatGameStakes(session.game);
  return "—";
}
