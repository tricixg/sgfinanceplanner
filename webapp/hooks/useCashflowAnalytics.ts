"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import {
  chunksCovering,
  mergeFlows,
  type AnalyticsChunk,
  type MonthFlowMap,
} from "@/lib/dashboard/cashflow";
import type { IncomeAnalyticsBundle } from "@/lib/income/analytics";
import type { SpendingAnalyticsBundle } from "@/lib/spending/analytics";

type ChunkData = {
  spending: SpendingAnalyticsBundle;
  income: IncomeAnalyticsBundle;
};

const chunkKey = (c: AnalyticsChunk) => `${c.throughYm}:${c.months}`;

async function fetchChunk(chunk: AnalyticsChunk): Promise<ChunkData> {
  const base = { months: String(chunk.months), throughYm: chunk.throughYm };
  const [spendRes, incomeRes] = await Promise.all([
    fetchJson<{ analytics?: SpendingAnalyticsBundle; error?: string }>(
      `/api/spending/analytics?${new URLSearchParams({ ...base, scope: "all" })}`,
      { credentials: "include" }
    ),
    fetchJson<{ analyticsTrueIncome?: IncomeAnalyticsBundle; error?: string }>(
      `/api/income/analytics?${new URLSearchParams(base)}`,
      { credentials: "include" }
    ),
  ]);
  if (!spendRes.res.ok) throw new Error(spendRes.data.error ?? "Failed to load spending");
  if (!incomeRes.res.ok) throw new Error(incomeRes.data.error ?? "Failed to load income");
  const spending = spendRes.data.analytics;
  // Same definition as Past Cashflow's default: reimbursements are not income.
  const income = incomeRes.data.analyticsTrueIncome;
  if (!spending || !income) throw new Error("Analytics are unavailable");
  return { spending, income };
}

/**
 * Month-by-month income and spending back to `earliestYm`, from the existing
 * analytics endpoints. Requests are made in fixed 6-month windows and cached,
 * so widening the range only fetches the months not already loaded.
 */
export function useCashflowAnalytics(enabled: boolean, currentYm: string, earliestYm: string) {
  const cacheRef = useRef(new Map<string, ChunkData>());
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const chunks = useMemo(
    () => chunksCovering(earliestYm, currentYm),
    [earliestYm, currentYm]
  );
  const chunksKey = chunks.map(chunkKey).join("|");

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      const cache = cacheRef.current;
      const wanted = chunksKey
        .split("|")
        .map((k) => {
          const [throughYm, months] = k.split(":");
          return { throughYm: throughYm!, months: Number(months) };
        })
        .filter((c) => opts?.force || !cache.has(chunkKey(c)));
      if (wanted.length === 0) {
        setLoading(false);
        return;
      }
      // Keep showing cached figures while refreshing; only block on first load.
      if (cache.size === 0) setLoading(true);
      setError("");
      try {
        const results = await Promise.all(wanted.map(fetchChunk));
        wanted.forEach((c, i) => cache.set(chunkKey(c), results[i]!));
        setVersion((v) => v + 1);
        console.info("[useCashflowAnalytics] loaded", {
          chunks: wanted.map(chunkKey),
        });
      } catch (e) {
        console.error("[useCashflowAnalytics] load failed", e);
        setError(e instanceof Error ? e.message : "Failed to load cash flow");
      } finally {
        setLoading(false);
      }
    },
    [enabled, chunksKey]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useDomainEvent(
    ["expense:changed", "budget:changed", "cards:changed", "savings:changed", "accounts:changed"],
    () => void load({ force: true })
  );

  const flows: MonthFlowMap = useMemo(() => {
    const all = [...cacheRef.current.values()];
    return mergeFlows(
      all.map((c) => c.spending),
      all.map((c) => c.income)
    );
    // `version` bumps whenever the cache changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Every chunk carries the same budget catalog order; prefer the freshest.
  const categoryOrder: string[] = useMemo(() => {
    const all = [...cacheRef.current.entries()].sort(([a], [b]) => b.localeCompare(a));
    return all.find(([, c]) => c.spending.categoryOrder?.length)?.[1].spending.categoryOrder ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const covered = chunksKey.split("|").every((k) => cacheRef.current.has(k));

  return {
    flows,
    /** Budget catalog line ids in creation order, for consistent category colours. */
    categoryOrder,
    /** True until the first response arrives. */
    loading: loading && cacheRef.current.size === 0,
    /** True while months needed for the current range are still being fetched. */
    pending: enabled && !covered && !error,
    error,
    reload: () => load({ force: true }),
  };
}
