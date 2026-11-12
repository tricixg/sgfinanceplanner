"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { CardStatementComputed } from "@/lib/cards/types";
import { useDomainEvent } from "@/hooks/useDomainEvent";

/** Every outstanding statement across all cards and statement dates — not limited to a
 * single cycle batch, since cards don't share a common statement date. */
export function useOutstandingCardStatements(enabled: boolean) {
  const [statements, setStatements] = useState<CardStatementComputed[]>([]);
  const [loading, setLoading] = useState(enabled);

  const reload = useCallback(async () => {
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

  useEffect(() => {
    void reload();
  }, [reload]);

  useDomainEvent(["expense:changed", "cards:changed"], () => {
    void reload();
  });

  return { statements, loading, reload };
}
