import type { DashboardState, Holding } from "@/lib/types";
import { cashAccountsTotal } from "./accounts";
import { ilpValueByLock } from "./ilp";

export function defaultHolding(): Holding {
  return { name: "", ticker: "", qty: 0, price: 0, sector: "" };
}

export function portfolioValue(holdings: Holding[]): number {
  return holdings.reduce((s, h) => s + h.qty * h.price, 0);
}

/** Stock portfolio from holdings; falls back to legacy `moo` when no lines exist. */
export function portfolioInvestmentValue(S: DashboardState): number {
  const fromHoldings = portfolioValue(S.holdings);
  return fromHoldings > 0 ? fromHoldings : S.moo;
}

export function migrateHoldings(saved: {
  holdings?: Holding[];
  moo?: number;
}): Holding[] {
  const holdings = saved.holdings ?? [];
  if (holdings.length > 0) return holdings;
  const moo = saved.moo ?? 0;
  if (moo > 0) {
    console.info("[migrateHoldings] legacy moo converted to holding line", { moo });
    return [
      {
        name: "Portfolio (legacy total)",
        ticker: "—",
        qty: 1,
        price: moo,
        sector: "",
      },
    ];
  }
  return [];
}

export type NetWorthSlice = {
  label: string;
  value: number;
  color: string;
};

export function wealthSummary(S: DashboardState) {
  const port = portfolioInvestmentValue(S);
  const { total: ilpVal, spendable: ilpSpendable, locked: ilpLocked } =
    ilpValueByLock(S);
  const invTotal = port + ilpVal;
  const liab = S.margin + S.ccDebt;
  const cash = cashAccountsTotal(S);
  const lnw = invTotal + cash - liab;
  const cpf = S.oa + S.sa + S.ma;
  return {
    port,
    invTotal,
    ilpVal,
    ilpSpendable,
    ilpLocked,
    liab,
    lnw,
    cpf,
    cash,
  };
}

export function netWorthTotal(S: DashboardState, includeCpf: boolean): number {
  const { lnw, cpf } = wealthSummary(S);
  return lnw + (includeCpf ? cpf : 0);
}

export function netWorthSlices(
  S: DashboardState,
  includeCpf: boolean
): NetWorthSlice[] {
  const { port, ilpVal, cash, cpf } = wealthSummary(S);
  const slices: NetWorthSlice[] = [
    { label: "Stock holdings", value: port, color: "#3d6b8e" },
    { label: "ILP", value: ilpVal, color: "#6b5a8e" },
    { label: "Savings accounts", value: cash, color: "#c08a2e" },
  ];
  if (includeCpf && cpf > 0) {
    slices.push({ label: "CPF", value: cpf, color: "#2f5d3a" });
  }
  return slices.filter((s) => s.value > 0);
}
