import type { DashboardState, Holding } from "@/lib/types";
import type { SavingsSnapshot } from "@/lib/savings/types";
import { cashAccountsTotal } from "./accounts";
import { effectiveCash, netWorthPersonalCash } from "./savings-totals";
import { holdingMarketValue, normalizeHolding, type LegacyHolding } from "./holdings";
import { ilpValueByLock } from "./ilp";
import { activeOtherLoansOutstanding } from "./debt";

export { normalizeHolding, portfolioTotals, holdingGain } from "./holdings";

export function defaultHolding(): Holding {
  return {
    name: "",
    ticker: "",
    market: "SGX",
    qty: 0,
    avgCost: 0,
    lastPrice: 0,
    sector: "",
  };
}

export function portfolioValue(holdings: Holding[]): number {
  return holdings.reduce((s, h) => s + holdingMarketValue(h), 0);
}

/** Stock portfolio from holdings; falls back to legacy `moo` when no lines exist. */
export function portfolioInvestmentValue(S: DashboardState): number {
  const fromHoldings = portfolioValue(S.holdings);
  return fromHoldings > 0 ? fromHoldings : S.moo;
}

export function migrateHoldings(saved: {
  holdings?: LegacyHolding[];
  moo?: number;
}): Holding[] {
  const raw = saved.holdings ?? [];
  if (raw.length > 0) {
    return raw.map((h) => normalizeHolding(h));
  }
  const moo = saved.moo ?? 0;
  if (moo > 0) {
    console.info("[migrateHoldings] legacy moo converted to holding line", { moo });
    return [
      normalizeHolding({
        name: "Portfolio (legacy total)",
        ticker: "—",
        qty: 1,
        price: moo,
        sector: "",
      }),
    ];
  }
  return [];
}

export type NetWorthSlice = {
  label: string;
  value: number;
  color: string;
};

export function resolveDashboardCash(
  S: DashboardState,
  savings: SavingsSnapshot | null | undefined
) {
  if (savings) {
    let personal = netWorthPersonalCash(savings);
    const localCash = cashAccountsTotal(S);
    if (personal <= 0 && localCash > 0) {
      personal = localCash;
      console.info("[resolveDashboardCash] using local accounts for net worth cash", {
        localCash,
      });
    }
    const joint = savings.jointNetWorthCash ?? savings.jointCash ?? 0;
    return {
      personal,
      joint,
      cash: effectiveCash(savings, false) || personal,
    };
  }
  const personal = cashAccountsTotal(S);
  return { personal, joint: 0, cash: personal };
}

export function wealthSummary(
  S: DashboardState,
  savings?: SavingsSnapshot | null
) {
  const port = portfolioInvestmentValue(S);
  const { total: ilpVal, spendable: ilpSpendable, locked: ilpLocked } =
    ilpValueByLock(S);
  const fundsVal = savings?.personalFundsValue ?? 0;
  const invTotal = port + ilpVal + fundsVal;
  const otherDebt = activeOtherLoansOutstanding(S);
  const liab = S.margin + otherDebt + (otherDebt > 0 ? 0 : S.ccDebt);
  const { cash, personal, joint } = resolveDashboardCash(S, savings);
  const lnw = invTotal + cash - liab;
  const cpf = S.oa + S.sa + S.ma;
  return {
    port,
    invTotal,
    ilpVal,
    ilpSpendable,
    ilpLocked,
    fundsVal,
    liab,
    lnw,
    cpf,
    cash,
    personalCash: personal,
    jointCash: joint,
  };
}

export function netWorthTotal(
  S: DashboardState,
  includeCpf: boolean,
  savings?: SavingsSnapshot | null
): number {
  const { lnw, cpf } = wealthSummary(S, savings);
  return lnw + (includeCpf ? cpf : 0);
}

export function netWorthSlices(
  S: DashboardState,
  includeCpf: boolean,
  savings?: SavingsSnapshot | null
): NetWorthSlice[] {
  const { port, ilpVal, fundsVal, personalCash, cpf } = wealthSummary(S, savings);
  const slices: NetWorthSlice[] = [
    { label: "Stock holdings", value: port, color: "#3d6b8e" },
    { label: "ILP", value: ilpVal, color: "#6b5a8e" },
    { label: "Funds", value: fundsVal, color: "#2e8f7a" },
    { label: "Cash accounts", value: personalCash, color: "#c08a2e" },
  ];
  if (includeCpf && cpf > 0) {
    slices.push({ label: "CPF", value: cpf, color: "#2f5d3a" });
  }
  return slices.filter((s) => s.value > 0);
}
