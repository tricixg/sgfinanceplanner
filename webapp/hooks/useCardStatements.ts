"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { CardStatementsBundle } from "@/lib/cards/types";
import { useDomainEvent } from "@/hooks/useDomainEvent";

const emptyBundle: CardStatementsBundle = {
  configured: false,
  statements: [],
  openCycles: [],
};

export type ReloadCardStatementsOpts = {
  /** Refresh data without toggling loading (avoids full-page loader on save). */
  silent?: boolean;
};

export function useCardStatements(enabled: boolean) {
  const [bundle, setBundle] = useState<CardStatementsBundle>(emptyBundle);
  const [loading, setLoading] = useState(enabled);

  const reload = useCallback(
    async (opts?: ReloadCardStatementsOpts) => {
      if (!enabled) {
        setLoading(false);
        setBundle(emptyBundle);
        return;
      }
      if (!opts?.silent) setLoading(true);
      try {
        const { res, data } = await fetchJson<CardStatementsBundle & { error?: string }>(
          "/api/credit-cards/statements",
          { credentials: "include" }
        );
        if (!res.ok) {
          console.error("[useCardStatements] load failed", data.error);
          if (!opts?.silent) setBundle(emptyBundle);
          return;
        }
        setBundle({
          configured: Boolean(data.configured),
          statements: data.statements ?? [],
          openCycles: data.openCycles ?? [],
        });
        console.info("[useCardStatements] loaded", {
          silent: Boolean(opts?.silent),
          statements: data.statements?.length ?? 0,
          openCycles: data.openCycles?.length ?? 0,
        });
      } catch (e) {
        console.error("[useCardStatements] load error", e);
        if (!opts?.silent) setBundle(emptyBundle);
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [enabled]
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useDomainEvent(
    ["expense:changed", "cards:changed"],
    () => {
      console.info("[useCardStatements] refresh after domain event");
      void reload({ silent: true });
    },
    [reload]
  );

  useEffect(() => {
    if (!enabled) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void reload({ silent: true });
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, reload]);

  return { bundle, loading, reload };
}
