"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { CardStatementsBundle } from "@/lib/cards/types";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import { errorMessage } from "@/lib/ui/notify";

const emptyBundle: CardStatementsBundle = {
  configured: false,
  statements: [],
  openCycles: [],
};

export type ReloadCardStatementsOpts = {
  /** Refresh data without toggling the full-page loading state. */
  silent?: boolean;
};

export function useCardStatements(enabled: boolean, cycleOffset = 0) {
  const [bundle, setBundle] = useState<CardStatementsBundle>(emptyBundle);
  const [loading, setLoading] = useState(enabled);
  const [navigating, setNavigating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);

  const reload = useCallback(
    async (opts?: ReloadCardStatementsOpts) => {
      if (!enabled) {
        setLoading(false);
        setNavigating(false);
        setBundle(emptyBundle);
        hasLoadedOnce.current = false;
        return;
      }

      const silent = opts?.silent ?? hasLoadedOnce.current;
      if (silent) setNavigating(true);
      else setLoading(true);
      setLoadError(null);

      try {
        const qs = new URLSearchParams({
          cycleOffset: String(Math.max(0, cycleOffset)),
        });
        const { res, data } = await fetchJson<CardStatementsBundle & { error?: string }>(
          `/api/credit-cards/statements?${qs}`,
          { credentials: "include" }
        );
        if (!res.ok) {
          console.error("[useCardStatements] load failed", data.error);
          setLoadError(data.error ?? "Couldn't load your card statements.");
          if (!silent) setBundle(emptyBundle);
          return;
        }
        setBundle({
          configured: Boolean(data.configured),
          statements: data.statements ?? [],
          openCycles: data.openCycles ?? [],
          navigation: data.navigation,
        });
        hasLoadedOnce.current = true;
        console.info("[useCardStatements] loaded", {
          silent,
          statements: data.statements?.length ?? 0,
          openCycles: data.openCycles?.length ?? 0,
          cycleOffset: data.navigation?.cycleOffset ?? cycleOffset,
          canGoOlder: data.navigation?.canGoOlder,
          canGoNewer: data.navigation?.canGoNewer,
        });
      } catch (e) {
        console.error("[useCardStatements] load error", e);
        setLoadError(errorMessage(e, "Couldn't load your card statements."));
        if (!silent) setBundle(emptyBundle);
      } finally {
        setLoading(false);
        setNavigating(false);
      }
    },
    [enabled, cycleOffset]
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useDomainEvent(
    ["expense:changed", "cards:changed"],
    () => {
      console.info("[useCardStatements] refresh after domain event");
      void reload({ silent: true });
    }
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

  return { bundle, loading, navigating, loadError, reload };
}
