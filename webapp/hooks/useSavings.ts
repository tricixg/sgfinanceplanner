"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { SavingsBundle, SavingsGoal, SavingsPool } from "@/lib/savings/types";
import { SavingsContext } from "@/contexts/app-data-contexts";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import { useDomainEvent } from "@/hooks/useDomainEvent";

const emptyTotals: SavingsBundle["totals"] = {
  personalSavingsCash: 0,
  personalNetWorthCash: 0,
  personalCash: 0,
  jointCash: 0,
  jointSavingsCash: 0,
  jointNetWorthCash: 0,
  personalMonthlySave: 0,
  jointMonthlySave: 0,
};

const emptyBundle: SavingsBundle = {
  pools: [],
  goals: [],
  totals: emptyTotals,
  householdId: null,
  paired: false,
  myUserId: "",
  members: [],
};

function bundleFromResponse(
  data: SavingsBundle & { configured?: boolean }
): SavingsBundle {
  return {
    pools: data.pools ?? [],
    goals: data.goals ?? [],
    totals: data.totals ?? emptyTotals,
    householdId: data.householdId ?? null,
    paired: Boolean(data.paired),
    myUserId: data.myUserId ?? "",
    members: data.members ?? [],
  };
}

export function useSavingsProvider(enabled: boolean) {
  const [bundle, setBundle] = useState<SavingsBundle>(emptyBundle);
  const [loading, setLoading] = useState(enabled);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      if (!opts?.silent) {
        setLoading(true);
      }
      setError("");
      try {
        const { res, data } = await fetchJson<
          SavingsBundle & { configured?: boolean; error?: string }
        >("/api/savings", { credentials: "include" });
        if (!res.ok) {
          throw new Error(data.error ?? `Failed to load savings (${res.status})`);
        }
        if (data.configured === false) {
          setConfigured(false);
          setBundle(emptyBundle);
          return;
        }
        setConfigured(true);
        setBundle(bundleFromResponse(data));
        setHasLoaded(true);
        console.info("[useSavings] loaded", {
          silent: Boolean(opts?.silent),
          pools: data.pools?.length,
          goals: data.goals?.length,
        });
      } catch (e) {
        console.error("[useSavings] load failed", e);
        setError(e instanceof Error ? e.message : "Failed to load savings");
        setConfigured(false);
      } finally {
        if (!opts?.silent) {
          setLoading(false);
        }
      }
    },
    [enabled]
  );

  useEffect(() => {
    load();
  }, [load]);

  useDomainEvent("savings:changed", () => {
    void load({ silent: true });
  });

  const savePools = useCallback(
    async (pools: SavingsPool[]) => {
      const { res, data } = await fetchJson<SavingsBundle & { error?: string }>(
        "/api/savings",
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pools }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to save pools");
      setBundle(bundleFromResponse(data));
      setHasLoaded(true);
      console.info("[useSavings] pools saved");
    },
    []
  );

  const saveGoals = useCallback(async (goals: SavingsGoal[]) => {
    const { res, data } = await fetchJson<SavingsBundle & { error?: string }>(
      "/api/savings",
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals }),
      }
    );
    if (!res.ok) throw new Error(data.error ?? "Failed to save goals");
    setBundle(bundleFromResponse(data));
    setHasLoaded(true);
    console.info("[useSavings] goals saved");
    dispatchDomainEvent("savings:changed");
  }, []);

  const recordGoalDeposit = useCallback(
    async (
      goalId: string,
      payload: {
        amount: number;
        occurredAt?: string;
        note?: string;
        kind?: "deposit" | "withdrawal" | "adjustment";
      }
    ) => {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/savings/goals/${goalId}/deposits`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Deposit failed");
      console.info("[useSavings] goal deposit", { goalId, ...payload });
      dispatchDomainEvent(["savings:changed", "accounts:changed"]);
      await load({ silent: true });
    },
    [load]
  );

  const recordPoolTransaction = useCallback(
    async (
      poolId: string,
      payload: {
        amount: number;
        occurredAt?: string;
        kind?: "deposit" | "withdrawal" | "adjustment";
        note?: string;
        goalId?: string;
      }
    ) => {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/savings/pools/${poolId}/transactions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Transaction failed");
      console.info("[useSavings] pool transaction", { poolId, ...payload });
      dispatchDomainEvent("savings:changed");
      await load({ silent: true });
    },
    [load]
  );

  return {
    bundle,
    loading,
    hasLoaded,
    configured,
    error,
    reload: load,
    savePools,
    saveGoals,
    recordGoalDeposit,
    recordPoolTransaction,
  };
}

export function useSavings() {
  const ctx = useContext(SavingsContext);
  if (!ctx) {
    throw new Error("useSavings must be used within AppDataProvider");
  }
  return ctx;
}
