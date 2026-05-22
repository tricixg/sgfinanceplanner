import type {
  DashboardState,
  Holding,
  HoldingMarket,
  PortfolioSnapshot,
} from "@/lib/types";

export type PortfolioTotals = {
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPct: number;
};

export type HoldingGain = {
  costBasis: number;
  marketValue: number;
  gain: number;
  gainPct: number;
};

/** Legacy holding shape before live-price migration. */
export type LegacyHolding = Partial<Holding> & {
  price?: number;
};

export function inferMarket(ticker: string): HoldingMarket {
  const t = ticker.trim().toUpperCase();
  if (!t || t === "—") return "SGX";
  if (t.endsWith(".SI")) return "SGX";
  if (/^[A-Z]{1,5}$/.test(t)) return "US";
  return "SGX";
}

export function normalizeTicker(ticker: string, market: HoldingMarket): string {
  const t = ticker.trim().toUpperCase();
  if (!t || t === "—") return t;
  if (market === "SGX") {
    return t.endsWith(".SI") ? t : `${t}.SI`;
  }
  return t.replace(/\.SI$/i, "");
}

export function normalizeHolding(raw: LegacyHolding): Holding {
  const legacyPrice =
    typeof raw.lastPrice === "number"
      ? raw.lastPrice
      : typeof raw.price === "number"
        ? raw.price
        : 0;
  const ticker = (raw.ticker ?? "").trim();
  const market = raw.market === "US" || raw.market === "SGX" ? raw.market : inferMarket(ticker);
  return {
    name: raw.name ?? "",
    ticker,
    market,
    qty: typeof raw.qty === "number" ? raw.qty : 0,
    avgCost: typeof raw.avgCost === "number" ? raw.avgCost : legacyPrice,
    lastPrice: legacyPrice,
    lastPriceAt: raw.lastPriceAt,
    sector: raw.sector ?? "",
  };
}

export function holdingCostBasis(h: Holding): number {
  return h.qty * h.avgCost;
}

export function holdingMarketValue(h: Holding): number {
  return h.qty * h.lastPrice;
}

export function holdingGain(h: Holding): HoldingGain {
  const costBasis = holdingCostBasis(h);
  const marketValue = holdingMarketValue(h);
  const gain = marketValue - costBasis;
  const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
  return { costBasis, marketValue, gain, gainPct };
}

export function portfolioTotals(holdings: Holding[]): PortfolioTotals {
  let totalValue = 0;
  let totalCost = 0;
  for (const h of holdings) {
    const g = holdingGain(h);
    totalValue += g.marketValue;
    totalCost += g.costBasis;
  }
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  return { totalValue, totalCost, totalGain, totalGainPct };
}

export function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MAX_PORTFOLIO_HISTORY = 90;

export function appendPortfolioSnapshot(
  state: DashboardState,
  totals: PortfolioTotals,
  at = todayDateStr()
): PortfolioSnapshot[] {
  const history = [...(state.portfolioHistory ?? [])];
  const last = history[history.length - 1];
  if (
    last &&
    last.recordedAt === at &&
    last.totalValue === totals.totalValue &&
    last.totalCost === totals.totalCost
  ) {
    return history;
  }
  const withoutDay = history.filter((s) => s.recordedAt !== at);
  withoutDay.push({
    recordedAt: at,
    totalValue: totals.totalValue,
    totalCost: totals.totalCost,
  });
  const trimmed =
    withoutDay.length > MAX_PORTFOLIO_HISTORY
      ? withoutDay.slice(-MAX_PORTFOLIO_HISTORY)
      : withoutDay;
  console.log("[holdings] portfolio snapshot appended", {
    at,
    totalValue: totals.totalValue,
    points: trimmed.length,
  });
  return trimmed;
}

export function quoteSymbolsFromHoldings(holdings: Holding[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of holdings) {
    if (!h.ticker || h.ticker === "—") continue;
    const sym = normalizeTicker(h.ticker, h.market);
    if (!seen.has(sym)) {
      seen.add(sym);
      out.push(sym);
    }
  }
  return out;
}
