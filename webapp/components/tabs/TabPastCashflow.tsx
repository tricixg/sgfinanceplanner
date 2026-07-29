"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SpendingBudgetVarianceTable } from "@/components/spending/SpendingBudgetVarianceTable";
import { SpendingInsightsPanel } from "@/components/spending/SpendingInsightsPanel";
import { SpendingKpiStrip } from "@/components/spending/SpendingKpiStrip";
import { SpendingMonthlyTable } from "@/components/spending/SpendingMonthlyTable";
import { SpendingCategoryChart } from "@/components/spending/SpendingCategoryChart";
import { SpendingStackedBarChart } from "@/components/spending/SpendingStackedBarChart";
import { IncomeKpiStrip } from "@/components/income/IncomeKpiStrip";
import { IncomeMonthlyTable } from "@/components/income/IncomeMonthlyTable";
import { IncomeCategoryChart } from "@/components/income/IncomeCategoryChart";
import { IncomeStackedBarChart } from "@/components/income/IncomeStackedBarChart";
import { fetchJson } from "@/lib/fetch-json";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import type { SpendingAnalyticsBundle } from "@/lib/spending/analytics";
import type { SpendingScope } from "@/lib/spending/bucket-spend";
import type { IncomeAnalyticsBundle } from "@/lib/income/analytics";

type Props = {
  enabled: boolean;
};

export function TabPastCashflow({ enabled }: Props) {
  const [scope, setScope] = useState<SpendingScope>("discretionary");
  const [analytics, setAnalytics] = useState<SpendingAnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const cacheRef = useRef<SpendingAnalyticsBundle | null>(null);

  const [incomeAnalytics, setIncomeAnalytics] = useState<IncomeAnalyticsBundle | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [incomeRefreshing, setIncomeRefreshing] = useState(false);
  const [incomeError, setIncomeError] = useState("");
  const incomeCacheRef = useRef<IncomeAnalyticsBundle | null>(null);

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
        console.info("[TabPastCashflow] spending loaded", {
          scope,
          months: data.analytics.months.length,
          total: data.analytics.monthly.reduce((s, m) => s + m.total, 0),
        });
      } catch (e) {
        console.error("[TabPastCashflow] spending load failed", e);
        setError(e instanceof Error ? e.message : "Failed to load");
        if (!soft) setAnalytics(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled, scope]
  );

  const loadIncome = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!enabled) return;
      const soft = opts?.soft && incomeCacheRef.current != null;
      if (soft) {
        setIncomeRefreshing(true);
      } else {
        setIncomeLoading(true);
      }
      setIncomeError("");
      try {
        const qs = new URLSearchParams({ months: "5" });
        const { res, data } = await fetchJson<{
          configured?: boolean;
          analytics?: IncomeAnalyticsBundle;
          error?: string;
        }>(`/api/income/analytics?${qs}`, { credentials: "include" });
        if (!res.ok) throw new Error(data.error ?? "Failed to load income analytics");
        if (!data.analytics) throw new Error("No analytics returned");
        incomeCacheRef.current = data.analytics;
        setIncomeAnalytics(data.analytics);
        console.info("[TabPastCashflow] income loaded", {
          months: data.analytics.months.length,
          total: data.analytics.monthly.reduce((s, m) => s + m.total, 0),
        });
      } catch (e) {
        console.error("[TabPastCashflow] income load failed", e);
        setIncomeError(e instanceof Error ? e.message : "Failed to load");
        if (!soft) setIncomeAnalytics(null);
      } finally {
        setIncomeLoading(false);
        setIncomeRefreshing(false);
      }
    },
    [enabled]
  );

  useEffect(() => {
    void load({ soft: cacheRef.current != null });
  }, [load]);

  useEffect(() => {
    void loadIncome({ soft: incomeCacheRef.current != null });
  }, [loadIncome]);

  useDomainEvent(
    ["expense:changed", "budget:changed", "cards:changed"],
    () => {
      void load({ soft: true });
    }
  );

  useDomainEvent(
    ["savings:changed", "accounts:changed"],
    () => {
      void loadIncome({ soft: true });
    }
  );

  if (!enabled) {
    return (
      <section className="panel on">
        <p className="note">Sign in to view past cashflow analytics.</p>
      </section>
    );
  }

  const showSkeleton = loading && !analytics;
  const showIncomeSkeleton = incomeLoading && !incomeAnalytics;

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

      <h2>Income</h2>
      <div className="ctrl" style={{ marginBottom: 16, alignItems: "center" }}>
        {incomeRefreshing ? <span className="note">Refreshing…</span> : null}
        {incomeError ? (
          <button type="button" className="btn sm" onClick={() => void loadIncome()}>
            Retry
          </button>
        ) : null}
      </div>

      {showIncomeSkeleton ? (
        <p className="loading">Loading income analytics…</p>
      ) : incomeError && !incomeAnalytics ? (
        <p className="note">{incomeError}</p>
      ) : incomeAnalytics ? (
        <>
          <IncomeKpiStrip analytics={incomeAnalytics} />
          <IncomeMonthlyTable analytics={incomeAnalytics} />
          <IncomeCategoryChart analytics={incomeAnalytics} />
          <IncomeStackedBarChart
            title="Income by account (5 months)"
            monthly={incomeAnalytics.monthly}
            dimension="byAccount"
          />
        </>
      ) : null}
    </section>
  );
}
