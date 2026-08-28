"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { MilesBalance, MilesTotals } from "@/lib/miles/types";
import { MilesContext } from "@/contexts/app-data-contexts";
import { dispatchDomainEvent } from "@/lib/events/domain-events";

export function useMilesProvider(enabled: boolean) {
  const [balances, setBalances] = useState<MilesBalance[]>([]);
  const [totals, setTotals] = useState<MilesTotals | null>(null);
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
        balances?: MilesBalance[];
        totals?: MilesTotals;
        error?: string;
      }>("/api/miles", { credentials: "include" });
      if (!res.ok || !data.configured) {
        setConfigured(false);
        return;
      }
      setConfigured(true);
      setBalances(data.balances ?? []);
      setTotals(data.totals ?? null);
      console.info("[useMiles] loaded", { count: data.balances?.length });
    } catch (e) {
      console.error("[useMiles] load failed", e);
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const requestedRef = useRef(false);
  const ensureLoaded = useCallback(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const onMilesChanged = (event: Event) => {
      const source =
        event instanceof CustomEvent && typeof event.detail?.source === "string"
          ? event.detail.source
          : event.type;
      console.info("[useMiles] reload from event", { source });
      void load();
    };
    window.addEventListener("miles:changed", onMilesChanged);
    return () => {
      window.removeEventListener("miles:changed", onMilesChanged);
    };
  }, [enabled, load]);

  const saveBalances = useCallback(async (next: MilesBalance[]) => {
    const { res, data } = await fetchJson<{
      configured?: boolean;
      balances?: MilesBalance[];
      totals?: MilesTotals;
      error?: string;
    }>("/api/miles", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ balances: next }),
    });
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to save miles balances");
    }
    setBalances(data.balances ?? next);
    setTotals(data.totals ?? null);
    console.info("[useMiles] saved", { count: next.length });
    dispatchDomainEvent("miles:changed");
  }, []);

  return useMemo(
    () => ({
      balances,
      totals,
      loading,
      configured,
      reload: load,
      ensureLoaded,
      saveBalances,
    }),
    [balances, totals, loading, configured, load, ensureLoaded, saveBalances]
  );
}

export function useMiles() {
  const ctx = useContext(MilesContext);
  if (!ctx) {
    throw new Error("useMiles must be used within AppDataProvider");
  }
  useEffect(() => {
    ctx.ensureLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ensureLoaded only, not ctx itself
  }, [ctx.ensureLoaded]);
  return ctx;
}
