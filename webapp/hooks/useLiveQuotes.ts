"use client";

import { useCallback, useState } from "react";
import type { DashboardState, Holding } from "@/lib/types";
import {
  appendPortfolioSnapshot,
  normalizeTicker,
  portfolioTotals,
  quoteSymbolsFromHoldings,
} from "@/lib/finance/holdings";
import { portfolioValue } from "@/lib/finance/wealth";

type QuoteMap = Record<string, { price: number; updatedAt: string }>;

export type LastRefresh = {
  status: "success" | "failed";
  at: string;
  reason?: "no_api_key" | "no_symbols" | "error";
};

type RefreshResult = {
  ok: boolean;
  updated: number;
  noApiKey?: boolean;
};

export function useLiveQuotes(
  holdings: Holding[],
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<LastRefresh | null>(null);
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

  const markFailed = useCallback(
    (reason: LastRefresh["reason"], message: string) => {
      const at = new Date().toISOString();
      setLastRefresh({ status: "failed", at, reason });
      setError(message);
      console.info("[useLiveQuotes] refresh failed", { reason, at });
    },
    []
  );

  const refresh = useCallback(async (): Promise<RefreshResult> => {
    const symbols = quoteSymbolsFromHoldings(holdings);
    if (symbols.length === 0) {
      markFailed(
        "no_symbols",
        "Add holdings with tickers to refresh prices."
      );
      return { ok: false, updated: 0 };
    }

    setLoading(true);
    setError(null);
    console.log("[useLiveQuotes] refreshing", symbols);

    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });
      const data = (await res.json()) as {
        error?: string;
        quotes?: QuoteMap;
      };

      if (res.status === 503 && data.error === "no_api_key") {
        setApiAvailable(false);
        markFailed(
          "no_api_key",
          "Live quotes need FINNHUB_API_KEY in .env.local — use manual last price in Edit until then."
        );
        return { ok: false, updated: 0, noApiKey: true };
      }

      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      setApiAvailable(true);
      const quotes = data.quotes ?? {};
      let updated = 0;
      const refreshedAt = new Date().toISOString();

      setState((prev) => {
        const nextHoldings = prev.holdings.map((h) => {
          if (!h.ticker || h.ticker === "—") return h;
          const sym = normalizeTicker(h.ticker, h.market);
          const q = quotes[sym];
          if (!q) return h;
          updated += 1;
          return {
            ...h,
            lastPrice: q.price,
            lastPriceAt: q.updatedAt,
          };
        });
        const moo = portfolioValue(nextHoldings);
        const totals = portfolioTotals(nextHoldings);
        const portfolioHistory = appendPortfolioSnapshot(
          { ...prev, holdings: nextHoldings },
          totals,
          refreshedAt.slice(0, 10)
        );
        return {
          ...prev,
          holdings: nextHoldings,
          moo,
          portfolioHistory,
        };
      });

      if (updated === 0) {
        markFailed(
          "error",
          "No prices returned — check tickers and market (SGX/US)."
        );
        return { ok: false, updated: 0 };
      }

      setLastRefresh({ status: "success", at: refreshedAt });
      setError(null);
      console.log("[useLiveQuotes] refresh done", {
        updated,
        symbols: symbols.length,
      });
      return { ok: true, updated };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Quote refresh failed";
      markFailed("error", msg);
      console.error("[useLiveQuotes] refresh failed", msg);
      return { ok: false, updated: 0 };
    } finally {
      setLoading(false);
    }
  }, [holdings, setState, markFailed]);

  return { refresh, loading, error, lastRefresh, apiAvailable };
}
