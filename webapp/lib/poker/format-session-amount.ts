import { fmt2 } from "@/lib/finance/helpers";
import { BASE_REPORTING_CURRENCY } from "@/lib/fx/currencies";
import { pokerProfitSgd, toSgd } from "@/lib/fx/convert";
import type { PokerSession } from "@/lib/poker/types";
import { pokerProfit, pokerTournamentReturn } from "@/lib/poker/types";

export function formatNativeMoney(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (code === BASE_REPORTING_CURRENCY) return fmt2(amount);
  return `${code} ${formatted}`;
}

function signedSgd(value: number): string {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${fmt2(Math.abs(value))}`;
}

export function formatSessionPlCell(session: PokerSession): string {
  const native = pokerProfit(session);
  const sgd = pokerProfitSgd(session);
  if (session.currency === BASE_REPORTING_CURRENCY) {
    return signedSgd(native);
  }
  return `${formatNativeMoney(native, session.currency)} · ${signedSgd(sgd)} SGD`;
}

/** Cash-out for cash games; prize + bounties for tournaments. */
export function sessionReturnAmount(session: PokerSession): number {
  if (session.sessionType === "tournament") {
    return pokerTournamentReturn(session);
  }
  return session.cashOut;
}

export function sessionReturnColumnLabel(session: Pick<PokerSession, "sessionType">): string {
  return session.sessionType === "tournament" ? "Amount won" : "Cash-out";
}

export function formatSessionReturnCell(session: PokerSession): string {
  const amount = sessionReturnAmount(session);
  if (session.sessionType === "tournament" && amount <= 0) {
    return "—";
  }
  return formatSessionAmountWithSgd(amount, session);
}

export function formatSessionAmountWithSgd(
  amount: number,
  session: Pick<PokerSession, "currency" | "fxRateToSgd">
): string {
  if (session.currency === BASE_REPORTING_CURRENCY) {
    return formatNativeMoney(amount, session.currency);
  }
  return `${formatNativeMoney(amount, session.currency)} · ${fmt2(toSgd(amount, session.fxRateToSgd))} SGD`;
}
