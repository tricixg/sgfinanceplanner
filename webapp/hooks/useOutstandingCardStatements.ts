"use client";

import { useCallback, useContext, useEffect, useRef, useState, useMemo } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { CardStatementComputed } from "@/lib/cards/types";
import { OutstandingCardStatementsContext } from "@/contexts/app-data-contexts";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import { errorMessage } from "@/lib/ui/notify";

/** Every outstanding statement across all cards and statement dates — not limited to a
 * single cycle batch, since cards don't share a common statement date. */
export function useOutstandingCardStatementsProvider(enabled: boolean) {
  const [statements, setStatements] = useState<CardStatementComputed[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setStatements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const { res, data } = await fetchJson<{
        statements?: CardStatementComputed[];
        error?: string;
      }>("/api/credit-cards/statements/outstanding", { credentials: "include" });
      if (!res.ok) {
        console.error("[useOutstandingCardStatements] load failed", data.error);
        setLoadError(data.error ?? "Couldn't load your card bills.");
        setStatements([]);
        return;
      }
      setStatements(data.statements ?? []);
      console.info("[useOutstandingCardStatements] loaded", {
        count: data.statements?.length ?? 0,
      });
    } catch (e) {
      console.error("[useOutstandingCardStatements] load error", e);
      setLoadError(errorMessage(e, "Couldn't load your card bills."));
      setStatements([]);
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

  useDomainEvent(["expense:changed", "cards:changed"], () => void load());

  // Stable identity: consumers re-render only when a member changes (PERF-006).
  return useMemo(
    () => ({ statements, loading, loadError, reload: load, ensureLoaded }),
    [statements, loading, loadError, load, ensureLoaded]
  );
}

export function useOutstandingCardStatements() {
  const ctx = useContext(OutstandingCardStatementsContext);
  if (!ctx) {
    throw new Error("useOutstandingCardStatements must be used within AppDataProvider");
  }
  useEffect(() => {
    ctx.ensureLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ensureLoaded only, not ctx itself
  }, [ctx.ensureLoaded]);
  return ctx;
}
