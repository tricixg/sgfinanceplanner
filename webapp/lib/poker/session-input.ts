import { normalizeCurrencyCode, isSupportedCurrency } from "@/lib/fx/currencies";
import { parsePokerPlayedAtInput } from "@/lib/poker/played-at";
import type { PokerSessionType, TournamentResult } from "@/lib/poker/types";

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
  rebuyAmount?: number | null;
  bountyAmount?: number | null;
  hours?: number | null;
  note?: string;
  currency?: string;
  fxRateToSgd?: number;
  fxRateManual?: boolean;
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
  financialAccountId: string | null;
  gameId: string | null;
  tournamentName: string | null;
  eventName: string | null;
  tournamentResult: TournamentResult | null;
  tournamentPlace: number | null;
  tournamentEntries: number | null;
  amountWon: number | null;
  rebuyAmount: number;
  bountyAmount: number;
  currency: string;
  fxRateToSgd: number;
  fxRateManual: boolean;
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

  let rebuyAmount = 0;
  let bountyAmount = 0;

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

    if (body.rebuyAmount != null) {
      const rebuy = Number(body.rebuyAmount);
      if (!Number.isFinite(rebuy) || rebuy < 0) {
        return { ok: false, error: "Valid rebuy amount required" };
      }
      rebuyAmount = rebuy;
    }
    if (body.bountyAmount != null) {
      const bounty = Number(body.bountyAmount);
      if (!Number.isFinite(bounty) || bounty < 0) {
        return { ok: false, error: "Valid bounty amount required" };
      }
      bountyAmount = bounty;
    }

    if (tournamentResult === "placed") {
      const won = typeof body.amountWon === "number" ? body.amountWon : NaN;
      if (!Number.isFinite(won) || won < 0) {
        return { ok: false, error: "Valid amount won required" };
      }
      amountWon = won;
      if (body.tournamentPlace != null) {
        const place = Number(body.tournamentPlace);
        if (Number.isFinite(place) && place >= 1) tournamentPlace = Math.round(place);
      }
    } else {
      amountWon = 0;
    }
    cashOut = (amountWon ?? 0) + bountyAmount;

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

  const playedAt = parsePokerPlayedAtInput(body.playedAt);

  let hours: number | null = null;
  if (body.hours != null) {
    const h = Number(body.hours);
    if (Number.isFinite(h) && h >= 0) hours = h;
  }

  const financialAccountId =
    typeof body.financialAccountId === "string" && body.financialAccountId.trim()
      ? body.financialAccountId.trim()
      : null;

  const currency = normalizeCurrencyCode(body.currency);
  if (!isSupportedCurrency(currency)) {
    return { ok: false, error: `Unsupported currency: ${currency}` };
  }

  let fxRateToSgd = 1;
  const fxRateManual = body.fxRateManual === true;
  if (body.fxRateManual === true) {
    const rate = typeof body.fxRateToSgd === "number" ? body.fxRateToSgd : NaN;
    if (!Number.isFinite(rate) || rate <= 0) {
      return { ok: false, error: "Valid FX rate required when using manual override" };
    }
    fxRateToSgd = rate;
  } else if (typeof body.fxRateToSgd === "number" && body.fxRateToSgd > 0) {
    fxRateToSgd = body.fxRateToSgd;
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
      financialAccountId,
      gameId,
      tournamentName,
      eventName,
      tournamentResult,
      tournamentPlace,
      tournamentEntries,
      amountWon,
      rebuyAmount,
      bountyAmount,
      currency,
      fxRateToSgd,
      fxRateManual,
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
    rebuy_amount: isTournament ? parsed.rebuyAmount : 0,
    bounty_amount: isTournament ? parsed.bountyAmount : 0,
    hours: parsed.hours,
    note: parsed.note,
    currency: parsed.currency,
    fx_rate_to_sgd: parsed.fxRateToSgd,
    fx_rate_manual: parsed.fxRateManual,
    financial_account_id: parsed.financialAccountId ?? null,
    updated_at: new Date().toISOString(),
  };
}
