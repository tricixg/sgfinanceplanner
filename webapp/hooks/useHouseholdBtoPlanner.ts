"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { SharedBtoPlannerFields } from "@/lib/finance";

/** Shared (household-level) subset of the BTO planner — synced across linked partners. */
export function useHouseholdBtoPlanner() {
  const [data, setData] = useState<Partial<SharedBtoPlannerFields> | null>(null);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { res, data: json } = await fetchJson<{
        configured: boolean;
        data: Partial<SharedBtoPlannerFields> | null;
        error?: string;
      }>("/api/household/bto-planner", { credentials: "include" });
      if (!res.ok) throw new Error(json.error ?? "Failed to load shared BTO plan");
      setConfigured(json.configured);
      setData(json.data);
      console.info("[useHouseholdBtoPlanner] loaded", { hasData: json.data != null });
    } catch (e) {
      console.error("[useHouseholdBtoPlanner] load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (patch: SharedBtoPlannerFields) => {
    const { res, data: json } = await fetchJson<{
      data?: Partial<SharedBtoPlannerFields>;
      error?: string;
    }>("/api/household/bto-planner", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: patch }),
    });
    if (!res.ok) throw new Error(json.error ?? "Failed to save shared BTO plan");
    setData(json.data ?? patch);
    console.info("[useHouseholdBtoPlanner] saved");
  }, []);

  return { sharedBto: data, loading, configured, reload: load, saveSharedBto: save };
}
