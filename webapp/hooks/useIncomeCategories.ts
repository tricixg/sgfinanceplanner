"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { IncomeCategory, IncomeCategoryInput } from "@/lib/income/types";

export function useIncomeCategories(enabled: boolean) {
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
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
        categories?: IncomeCategory[];
        error?: string;
      }>("/api/income-categories", { credentials: "include" });
      if (!res.ok || !data.configured) {
        setConfigured(false);
        setCategories([]);
        return;
      }
      setConfigured(true);
      setCategories(data.categories ?? []);
      console.info("[useIncomeCategories] loaded", data.categories?.length);
    } catch (e) {
      console.error("[useIncomeCategories] load failed", e);
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (incoming: IncomeCategoryInput[]) => {
      const { res, data } = await fetchJson<{
        categories?: IncomeCategory[];
        error?: string;
      }>("/api/income-categories", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: incoming }),
      });
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save income categories");
      }
      setCategories(data.categories ?? []);
      console.info("[useIncomeCategories] saved", { count: data.categories?.length });
    },
    []
  );

  return { categories, loading, configured, reload: load, save };
}
