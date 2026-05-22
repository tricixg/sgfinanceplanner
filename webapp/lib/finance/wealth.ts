import type { DashboardState, Holding } from "@/lib/types";

export function portfolioValue(holdings: Holding[]): number {
  return holdings.reduce((s, h) => s + h.qty * h.price, 0);
}

export function wealthSummary(S: DashboardState) {
  const port = portfolioValue(S.holdings);
  const invTotal = port + S.ilp;
  const liab = S.margin + S.ccDebt;
  const lnw = invTotal + S.cash - liab;
  const cpf = S.oa + S.sa + S.ma;
  return { port, invTotal, liab, lnw, cpf };
}
