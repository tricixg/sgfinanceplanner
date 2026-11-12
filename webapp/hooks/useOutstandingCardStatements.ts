"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { CardStatementComputed } from "@/lib/cards/types";
import { OutstandingCardStatementsContext } from "@/contexts/app-data-contexts";
import { useDomainEvent } from "@/hooks/useDomainEvent";

/** Every outstanding statement across all cards and statement dates — not limited to a
 * single cycle batch, since cards don't share a common statement date. */
export function useOutstandingCardStatementsProvider(enabled: boolean) {
  const [statements, setStatements] = useState<CardStatementComputed[]>([]);
  const [loading, setLoading] = useState(enabled);

  const load = useCallback(async () => {
    if (!enabled) {
      setStatements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { res, data } = await fetchJson<{
        statements?: CardStatementComputed[];
        error?: string;
      }>("/api/credit-cards/statements/outstanding", { credentials: "include" });
      if (!res.ok) {
        console.error("[useOutstandingCardStatements] load failed", data.error);
        setStatements([]);
        return;
      }
      setStatements(data.statements ?? []);
      console.info("[useOutstandingCardStatements] loaded", {
        count: data.statements?.length ?? 0,
      });
    } catch (e) {
      console.error("[useOutstandingCardStatements] load error", e);
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

  return { statements, loading, reload: load, ensureLoaded };
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
