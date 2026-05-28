import type { PokerSessionType, TournamentResult } from "@/lib/poker/types";
import { sgtTodayYmd } from "@/lib/time/sgt";

export type PokerSessionBody = {
  sessionType?: PokerSessionType;
  buyIn?: number;
  cashOut?: number;
  playedAt?: string;
  location?: string;
  venue?: string;
  tournamentName?: string;
  gameId?: string;
  eventName?: string;
  tournamentResult?: TournamentResult;
  tournamentPlace?: number | null;
  tournamentEntries?: number | null;
  amountWon?: number | null;
  hours?: number | null;
  note?: string;
  financialAccountId?: string;
};

export type ParsedPokerSession = {
  sessionType: PokerSessionType;
  buyIn: number;
  cashOut: number;
  playedAt: string;
  location: string;
  hours: number | null;
  note: string;
  financialAccountId: string;
  gameId: string | null;
  tournamentName: string | null;
  eventName: string | null;
  tournamentResult: TournamentResult | null;
  tournamentPlace: number | null;
  tournamentEntries: number | null;
  amountWon: number | null;
};

export function parsePokerSessionBody(
  body: PokerSessionBody
): { ok: true; data: ParsedPokerSession } | { ok: false; error: string } {
  const sessionType: PokerSessionType =
    body.sessionType === "tournament" ? "tournament" : "cash_game";

  const buyIn = typeof body.buyIn === "number" ? body.buyIn : NaN;
  if (!Number.isFinite(buyIn) || buyIn < 0) {
    return { ok: false, error: "Valid buy-in required" };
  }

  let cashOut = typeof body.cashOut === "number" ? body.cashOut : 0;
  let amountWon: number | null = null;
  let tournamentResult: TournamentResult | null = null;
  let tournamentPlace: number | null = null;
  let tournamentEntries: number | null = null;
  let tournamentName: string | null = null;
  let eventName: string | null = null;
  let gameId: string | null = null;

  if (sessionType === "tournament") {
    tournamentName =
      typeof body.tournamentName === "string" ? body.tournamentName.trim() : "";
    eventName = typeof body.eventName === "string" ? body.eventName.trim() : "";
    if (!tournamentName) {
      return { ok: false, error: "Tournament name is required" };
    }
    if (!eventName) {
      return { ok: false, error: "Event name is required" };
    }
    if (body.tournamentResult !== "placed" && body.tournamentResult !== "busted") {
      return { ok: false, error: "Result must be placed or busted" };
    }
    tournamentResult = body.tournamentResult;
    if (tournamentResult === "placed") {
      const won = typeof body.amountWon === "number" ? body.amountWon : NaN;
      if (!Number.isFinite(won) || won < 0) {
        return { ok: false, error: "Valid amount won required" };
      }
      amountWon = won;
      cashOut = won;
      if (body.tournamentPlace != null) {
        const place = Number(body.tournamentPlace);
        if (Number.isFinite(place) && place >= 1) tournamentPlace = Math.round(place);
      }
    } else {
      amountWon = 0;
      cashOut = 0;
    }
    if (body.tournamentEntries != null) {
      const entries = Number(body.tournamentEntries);
      if (Number.isFinite(entries) && entries >= 1) {
        tournamentEntries = Math.round(entries);
      }
    }
  } else {
    if (!Number.isFinite(cashOut) || cashOut < 0) {
      return { ok: false, error: "Valid cash-out required" };
    }
    if (!body.gameId) {
      return { ok: false, error: "Game (stakes) is required" };
    }
    gameId = body.gameId;
  }

  const location =
    (typeof body.location === "string" ? body.location : body.venue ?? "").trim();

  const playedAt =
    typeof body.playedAt === "string" && body.playedAt.length >= 10
      ? body.playedAt.slice(0, 10)
      : sgtTodayYmd();

  let hours: number | null = null;
  if (body.hours != null) {
    const h = Number(body.hours);
    if (Number.isFinite(h) && h >= 0) hours = h;
  }

  if (!body.financialAccountId) {
    return { ok: false, error: "financialAccountId required" };
  }

  return {
    ok: true,
    data: {
      sessionType,
      buyIn,
      cashOut,
      playedAt,
      location,
      hours,
      note: body.note ?? "",
      financialAccountId: body.financialAccountId,
      gameId,
      tournamentName,
      eventName,
      tournamentResult,
      tournamentPlace,
      tournamentEntries,
      amountWon,
    },
  };
}

export function pokerSessionRowFromParsed(parsed: ParsedPokerSession) {
  const isTournament = parsed.sessionType === "tournament";
  return {
    session_type: parsed.sessionType,
    buy_in: parsed.buyIn,
    cash_out: parsed.cashOut,
    played_at: parsed.playedAt,
    venue: parsed.location,
    location: parsed.location,
    tournament_name: isTournament ? parsed.tournamentName : null,
    game_id: isTournament ? null : parsed.gameId,
    event_name: isTournament ? parsed.eventName : null,
    tournament_result: isTournament ? parsed.tournamentResult : null,
    tournament_place: isTournament ? parsed.tournamentPlace : null,
    tournament_entries: isTournament ? parsed.tournamentEntries : null,
    amount_won: isTournament ? parsed.amountWon : null,
    hours: parsed.hours,
    note: parsed.note,
    financial_account_id: parsed.financialAccountId,
    updated_at: new Date().toISOString(),
  };
}
