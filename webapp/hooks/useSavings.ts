"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { SavingsBundle } from "@/lib/savings/types";

const emptyBundle: SavingsBundle = {
  accounts: [],
  pools: [],
  goals: [],
  totals: {
    personalCash: 0,
    jointCash: 0,
    personalMonthlySave: 0,
    jointMonthlySave: 0,
  },
  householdId: null,
  paired: false,
};

export function useSavings(enabled: boolean) {
  const [bundle, setBundle] = useState<SavingsBundle>(emptyBundle);
  const [loading, setLoading] = useState(enabled);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
      setBundle({
        accounts: data.accounts ?? [],
        pools: data.pools ?? [],
        goals: data.goals ?? [],
        totals: data.totals ?? emptyBundle.totals,
        householdId: data.householdId ?? null,
        paired: Boolean(data.paired),
      });
      console.info("[useSavings] loaded", {
        accounts: data.accounts?.length,
        pools: data.pools?.length,
        goals: data.goals?.length,
      });
    } catch (e) {
      console.error("[useSavings] load failed", e);
      setError(e instanceof Error ? e.message : "Failed to load savings");
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (next: Pick<SavingsBundle, "accounts" | "pools" | "goals">) => {
      const { res, data } = await fetchJson<SavingsBundle & { error?: string }>(
        "/api/savings",
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        }
      );
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save savings");
      }
      setBundle({
        accounts: data.accounts ?? [],
        pools: data.pools ?? [],
        goals: data.goals ?? [],
        totals: data.totals ?? emptyBundle.totals,
        householdId: data.householdId ?? null,
        paired: Boolean(data.paired),
      });
      console.info("[useSavings] saved");
      return data;
    },
    []
  );

  return { bundle, loading, configured, error, reload: load, save };
}
