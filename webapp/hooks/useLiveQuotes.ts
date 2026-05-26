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
import { fetchJson } from "@/lib/fetch-json";

type QuoteMap = Record<string, { price: number; updatedAt: string }>;

export type LastRefresh = {
  status: "success" | "failed";
  at: string;
  reason?: "no_symbols" | "error";
};

type RefreshResult = {
  ok: boolean;
  updated: number;
  requested: number;
};

type QuotePersistPayload = {
  holdings: Holding[];
  moo: number;
  portfolioHistory: DashboardState["portfolioHistory"];
};

export function useLiveQuotes(
  holdings: Holding[],
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void,
  onPersist?: (payload: QuotePersistPayload) => void | Promise<void>
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<LastRefresh | null>(null);

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
    const requested = holdings.filter((h) => h.ticker && h.ticker !== "—").length;

    if (symbols.length === 0) {
      markFailed(
        "no_symbols",
        "Add holdings with tickers to refresh prices."
      );
      return { ok: false, updated: 0, requested: 0 };
    }

    setLoading(true);
    setError(null);
    console.log("[useLiveQuotes] refreshing via Yahoo", symbols);

    try {
      const { res, data } = await fetchJson<{
        error?: string;
        quotes?: QuoteMap;
      }>("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });

      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const quotes = data.quotes ?? {};
      let updated = 0;
      const refreshedAt = new Date().toISOString();

      let persistPayload: QuotePersistPayload | null = null;
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
            // Use fetch time for staleness — Yahoo regularMarketTime can be days old.
            lastPriceAt: refreshedAt,
          };
        });
        const moo = portfolioValue(nextHoldings);
        const totals = portfolioTotals(nextHoldings);
        const portfolioHistory = appendPortfolioSnapshot(
          { ...prev, holdings: nextHoldings },
          totals,
          refreshedAt.slice(0, 10)
        );
        persistPayload = { holdings: nextHoldings, moo, portfolioHistory };
        return {
          ...prev,
          holdings: nextHoldings,
          moo,
          portfolioHistory,
        };
      });
      if (persistPayload && onPersist) {
        await onPersist(persistPayload);
      }

      if (updated === 0) {
        markFailed(
          "error",
          "No prices returned — check tickers and market (SGX uses .SI, US plain ticker)."
        );
        return { ok: false, updated: 0, requested };
      }

      setLastRefresh({ status: "success", at: refreshedAt });
      if (updated < requested) {
        setError(
          `Updated ${updated} of ${requested} holdings. Others need manual Last $ in Edit.`
        );
        console.log("[useLiveQuotes] partial refresh", { updated, requested });
      } else {
        setError(null);
      }
      console.log("[useLiveQuotes] refresh done", { updated, requested });
      return { ok: true, updated, requested };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Quote refresh failed";
      markFailed("error", msg);
      console.error("[useLiveQuotes] refresh failed", msg);
      return { ok: false, updated: 0, requested };
    } finally {
      setLoading(false);
    }
  }, [holdings, setState, markFailed, onPersist]);

  return { refresh, loading, error, lastRefresh };
}
