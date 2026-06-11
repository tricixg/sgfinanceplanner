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
  rebuyAmount: number;
  bountyAmount: number;
  hours: number | null;
  note: string;
  currency: string;
  fxRateToSgd: number;
  fxRateManual: boolean;
  financialAccountId: string | null;
  savingsTransactionId: string | null;
  createdAt: string;
};

export type PokerProfitInput = Pick<
  PokerSession,
  "buyIn" | "cashOut" | "sessionType" | "amountWon"
> & {
  rebuyAmount?: number;
  bountyAmount?: number;
};

/** Initial buy-in plus any rebuys (tournaments only). */
export function pokerTournamentCost(
  session: Pick<PokerSession, "buyIn"> & { rebuyAmount?: number }
): number {
  return session.buyIn + (session.rebuyAmount ?? 0);
}

/** Prize pool winnings plus bounty payouts (tournaments only). */
export function pokerTournamentReturn(
  session: Pick<PokerSession, "amountWon"> & { bountyAmount?: number }
): number {
  return (session.amountWon ?? 0) + (session.bountyAmount ?? 0);
}

export function pokerProfit(session: PokerProfitInput): number {
  if (session.sessionType === "tournament") {
    return pokerTournamentReturn(session) - pokerTournamentCost(session);
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
