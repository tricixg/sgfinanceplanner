import type { DashboardState, Holding } from "@/lib/types";
import type { SavingsSnapshot } from "@/lib/savings/types";
import type { OpenCycleEstimate } from "@/lib/cards/types";
import { btCoveredAmount, roundMoney } from "@/lib/cards/interest-accrual";
import { cashAccountsTotal } from "./accounts";
import { effectiveCash, netWorthPersonalCash } from "./savings-totals";
import { holdingMarketValue, normalizeHolding, type LegacyHolding } from "./holdings";
import { ilpValueByLock } from "./ilp";
import {
  activeLoanOutstanding,
  activePersonalLoansOutstanding,
  activeBtLoansOutstanding,
  btOutstandingByCard,
} from "./debt";

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

export type LiabilityKey =
  | "margin"
  | "instalmentLoans"
  | "personalLoans"
  | "btLoans"
  | "cardBalances";

export type LiabilityLine = { key: LiabilityKey; label: string; amount: number };

/**
 * Every liability category, always in this fixed order (even at $0 — this
 * feeds a checkbox breakdown, not a filtered chart). `cardBalances` nets each
 * card's currently-owed total against any balance-transfer loan linked to
 * that card, since a BT loan's `outstanding` is already counted inside its
 * card's own statement balance (see btCoveredAmount) — without this, BT debt
 * would be double-counted against the separate `btLoans` line below.
 */
export function liabilityBreakdown(
  S: DashboardState,
  openCycles: OpenCycleEstimate[] = []
): LiabilityLine[] {
  const btByCard = btOutstandingByCard(S);
  const cardBalances = openCycles.reduce((sum, cycle) => {
    // otherLoans.sourceCreditCardId holds the card's card_key, not credit_cards.id —
    // match on creditCardKey here, not creditCardId (see btOutstandingByCard).
    const btForCard = btByCard.get(cycle.creditCardKey) ?? 0;
    const nonBt = Math.max(
      0,
      cycle.estimatedTotal - btCoveredAmount(btForCard, cycle.estimatedTotal)
    );
    return sum + nonBt;
  }, 0);

  return [
    { key: "margin", label: "Margin loan", amount: S.margin },
    {
      key: "instalmentLoans",
      label: "Instalment / card-linked loans",
      amount: activeLoanOutstanding(S),
    },
    {
      key: "personalLoans",
      label: "Personal loans",
      amount: activePersonalLoansOutstanding(S),
    },
    {
      key: "btLoans",
      label: "Balance-transfer loans",
      amount: activeBtLoansOutstanding(S),
    },
    {
      key: "cardBalances",
      label: "Credit card balances",
      amount: roundMoney(cardBalances),
    },
  ];
}

export function wealthSummary(
  S: DashboardState,
  savings?: SavingsSnapshot | null,
  openCycles?: OpenCycleEstimate[]
) {
  const port = portfolioInvestmentValue(S);
  const { total: ilpVal, spendable: ilpSpendable, locked: ilpLocked } =
    ilpValueByLock(S);
  const fundsVal = savings?.personalFundsValue ?? 0;
  const invTotal = port + ilpVal + fundsVal;
  const liabLines = liabilityBreakdown(S, openCycles ?? []);
  const liab = liabLines.reduce((s, l) => s + l.amount, 0);
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
    liabLines,
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
  savings?: SavingsSnapshot | null,
  openCycles?: OpenCycleEstimate[]
): number {
  const { lnw, cpf } = wealthSummary(S, savings, openCycles);
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
