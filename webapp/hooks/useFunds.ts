"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { Fund, FundsTotals } from "@/lib/funds/types";
import { FundsContext } from "@/contexts/app-data-contexts";
import { dispatchDomainEvent } from "@/lib/events/domain-events";

export function useFundsProvider(enabled: boolean) {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [totals, setTotals] = useState<FundsTotals | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [configured, setConfigured] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { res, data } = await fetchJson<{
        configured?: boolean;
        funds?: Fund[];
        totals?: FundsTotals;
        error?: string;
      }>("/api/funds", { credentials: "include" });
      if (!res.ok || !data.configured) {
        setConfigured(false);
        return;
      }
      setConfigured(true);
      setFunds(data.funds ?? []);
      setTotals(data.totals ?? null);
      console.info("[useFunds] loaded", { count: data.funds?.length });
    } catch (e) {
      console.error("[useFunds] load failed", e);
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const onFundsChanged = (event: Event) => {
      const source =
        event instanceof CustomEvent && typeof event.detail?.source === "string"
          ? event.detail.source
          : event.type;
      console.info("[useFunds] reload from event", { source });
      void load();
    };
    window.addEventListener("funds:changed", onFundsChanged);
    return () => {
      window.removeEventListener("funds:changed", onFundsChanged);
    };
  }, [enabled, load]);

  const saveFunds = useCallback(async (next: Fund[]) => {
    const { res, data } = await fetchJson<{
      configured?: boolean;
      funds?: Fund[];
      totals?: FundsTotals;
      error?: string;
    }>("/api/funds", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ funds: next }),
    });
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to save funds");
    }
    setFunds(data.funds ?? next);
    setTotals(data.totals ?? null);
    console.info("[useFunds] saved", { count: next.length });
    dispatchDomainEvent(["funds:changed", "savings:changed"]);
  }, []);

  const recordFundTransaction = useCallback(
    async (
      fundId: string,
      payload: {
        amount: number;
        occurredAt?: string;
        kind?: "deposit" | "withdrawal" | "payout";
        note?: string;
        goalId?: string | null;
      }
    ) => {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/funds/${fundId}/transactions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        throw new Error(data.error ?? "Transaction failed");
      }
      console.info("[useFunds] transaction recorded", { fundId, ...payload });
      dispatchDomainEvent(["funds:changed", "savings:changed"]);
      await load();
    },
    [load]
  );

  const deleteFundTransaction = useCallback(
    async (fundId: string, transactionId: string) => {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/funds/${fundId}/transactions/${transactionId}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to delete transaction");
      }
      console.info("[useFunds] transaction deleted", { fundId, transactionId });
      dispatchDomainEvent(["funds:changed", "savings:changed"]);
      await load();
    },
    [load]
  );

  return useMemo(
    () => ({
      funds,
      totals,
      loading,
      configured,
      reload: load,
      saveFunds,
      recordFundTransaction,
      deleteFundTransaction,
    }),
    [
      funds,
      totals,
      loading,
      configured,
      load,
      saveFunds,
      recordFundTransaction,
      deleteFundTransaction,
    ]
  );
}

export function useFunds() {
  const ctx = useContext(FundsContext);
  if (!ctx) {
    throw new Error("useFunds must be used within AppDataProvider");
  }
  return ctx;
}
