import type { DashboardState, Holding } from "@/lib/types";
import type { SavingsSnapshot } from "@/lib/savings/types";
import { cashAccountsTotal } from "./accounts";
import { effectiveCash } from "./savings-totals";
import { holdingMarketValue, normalizeHolding, type LegacyHolding } from "./holdings";
import { ilpValueByLock } from "./ilp";

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
  const includeJoint = Boolean(S.prefs?.includeJointSavings);
  if (savings) {
    const personal = savings.personalCash;
    const joint = savings.jointCash;
    return {
      personal,
      joint,
      cash: effectiveCash(savings, includeJoint),
      includeJoint,
    };
  }
  const personal = cashAccountsTotal(S);
  return { personal, joint: 0, cash: personal, includeJoint };
}

export function wealthSummary(
  S: DashboardState,
  savings?: SavingsSnapshot | null
) {
  const port = portfolioInvestmentValue(S);
  const { total: ilpVal, spendable: ilpSpendable, locked: ilpLocked } =
    ilpValueByLock(S);
  const invTotal = port + ilpVal;
  const liab = S.margin + S.ccDebt;
  const { cash, personal, joint, includeJoint } = resolveDashboardCash(S, savings);
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
    personalCash: personal,
    jointCash: joint,
    includeJointSavings: includeJoint,
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
  const { port, ilpVal, personalCash, jointCash, includeJointSavings, cpf } =
    wealthSummary(S, savings);
  const slices: NetWorthSlice[] = [
    { label: "Stock holdings", value: port, color: "#3d6b8e" },
    { label: "ILP", value: ilpVal, color: "#6b5a8e" },
    { label: "Personal savings", value: personalCash, color: "#c08a2e" },
  ];
  if (includeJointSavings && jointCash > 0) {
    slices.push({ label: "Joint savings", value: jointCash, color: "#d4a574" });
  }
  if (includeCpf && cpf > 0) {
    slices.push({ label: "CPF", value: cpf, color: "#2f5d3a" });
  }
  return slices.filter((s) => s.value > 0);
}
