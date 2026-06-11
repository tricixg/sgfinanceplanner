"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SpendingBudgetVarianceTable } from "@/components/spending/SpendingBudgetVarianceTable";
import { SpendingInsightsPanel } from "@/components/spending/SpendingInsightsPanel";
import { SpendingKpiStrip } from "@/components/spending/SpendingKpiStrip";
import { SpendingMonthlyTable } from "@/components/spending/SpendingMonthlyTable";
import { SpendingCategoryChart } from "@/components/spending/SpendingCategoryChart";
import { SpendingStackedBarChart } from "@/components/spending/SpendingStackedBarChart";
import { fetchJson } from "@/lib/fetch-json";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import type { SpendingAnalyticsBundle } from "@/lib/spending/analytics";
import type { SpendingScope } from "@/lib/spending/bucket-spend";

type Props = {
  enabled: boolean;
};

export function TabPastSpendings({ enabled }: Props) {
  const [scope, setScope] = useState<SpendingScope>("discretionary");
  const [analytics, setAnalytics] = useState<SpendingAnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const cacheRef = useRef<SpendingAnalyticsBundle | null>(null);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!enabled) return;
      const soft = opts?.soft && cacheRef.current != null;
      if (soft) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const qs = new URLSearchParams({
          months: "5",
          scope,
        });
        const { res, data } = await fetchJson<{
          configured?: boolean;
          analytics?: SpendingAnalyticsBundle;
          error?: string;
        }>(`/api/spending/analytics?${qs}`, { credentials: "include" });
        if (!res.ok) throw new Error(data.error ?? "Failed to load spending analytics");
        if (!data.analytics) throw new Error("No analytics returned");
        cacheRef.current = data.analytics;
        setAnalytics(data.analytics);
        console.info("[TabPastSpendings] loaded", {
          scope,
          months: data.analytics.months.length,
          total: data.analytics.monthly.reduce((s, m) => s + m.total, 0),
        });
      } catch (e) {
        console.error("[TabPastSpendings] load failed", e);
        setError(e instanceof Error ? e.message : "Failed to load");
        if (!soft) setAnalytics(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled, scope]
  );

  useEffect(() => {
    void load({ soft: cacheRef.current != null });
  }, [load]);

  useDomainEvent(
    ["expense:changed", "budget:changed", "cards:changed"],
    () => {
      void load({ soft: true });
    },
    [load]
  );

  if (!enabled) {
    return (
      <section className="panel on">
        <p className="note">Sign in to view past spending analytics.</p>
      </section>
    );
  }

  const showSkeleton = loading && !analytics;

  return (
    <section className="panel on">
      <div className="ctrl" style={{ marginBottom: 16, alignItems: "center" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>View</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as SpendingScope)}
          >
            <option value="discretionary">Discretionary spend</option>
            <option value="all">All spending</option>
          </select>
        </label>
        {refreshing ? <span className="note">Refreshing…</span> : null}
        {error ? (
          <button type="button" className="btn sm" onClick={() => void load()}>
            Retry
          </button>
        ) : null}
      </div>

      {showSkeleton ? (
        <p className="loading">Loading spending analytics…</p>
      ) : error && !analytics ? (
        <p className="note">{error}</p>
      ) : analytics ? (
        <>
          <SpendingKpiStrip analytics={analytics} />
          <SpendingMonthlyTable analytics={analytics} />
          <SpendingCategoryChart analytics={analytics} />
          <SpendingStackedBarChart
            title="Spend by card (5 months)"
            monthly={analytics.monthly}
            dimension="byCard"
          />
          <SpendingBudgetVarianceTable analytics={analytics} />
          <SpendingInsightsPanel analytics={analytics} />
        </>
      ) : null}
    </section>
  );
}
