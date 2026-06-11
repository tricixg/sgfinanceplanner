import type { PokerSession } from "@/lib/poker/types";
import { pokerProfit, pokerTournamentCost, pokerTournamentReturn } from "@/lib/poker/types";
import { BASE_REPORTING_CURRENCY } from "./currencies";

export function toSgd(amount: number, fxRateToSgd: number): number {
  const rate = Number.isFinite(fxRateToSgd) && fxRateToSgd > 0 ? fxRateToSgd : 1;
  return Math.round(amount * rate * 100) / 100;
}

export function pokerProfitSgd(
  session: Pick<
    PokerSession,
    | "buyIn"
    | "cashOut"
    | "sessionType"
    | "amountWon"
    | "rebuyAmount"
    | "bountyAmount"
    | "fxRateToSgd"
  >
): number {
  return toSgd(pokerProfit(session), session.fxRateToSgd);
}

export function pokerBuyInSgd(
  session: Pick<PokerSession, "buyIn" | "rebuyAmount" | "sessionType" | "fxRateToSgd">
): number {
  const total =
    session.sessionType === "tournament"
      ? pokerTournamentCost(session)
      : session.buyIn;
  return toSgd(total, session.fxRateToSgd);
}

export function pokerCashOutDisplaySgd(
  session: Pick<
    PokerSession,
    "sessionType" | "cashOut" | "amountWon" | "bountyAmount" | "fxRateToSgd"
  >
): number {
  const gross =
    session.sessionType === "tournament"
      ? pokerTournamentReturn(session)
      : session.cashOut;
  return toSgd(gross, session.fxRateToSgd);
}

export function reportingCurrencyLabel(): string {
  return BASE_REPORTING_CURRENCY;
}
