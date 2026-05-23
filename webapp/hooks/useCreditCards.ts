"use client";

import { useCallback, useEffect, useState } from "react";
import type { CreditCard } from "@/lib/types";
import { fetchJson } from "@/lib/fetch-json";

export function useCreditCards(enabled: boolean) {
  const [cards, setCards] = useState<CreditCard[]>([]);
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
      const { res, data } = await fetchJson<{
        configured?: boolean;
        cards?: CreditCard[];
        error?: string;
      }>("/api/credit-cards", { credentials: "include" });
      if (!res.ok) throw new Error(data.error ?? "Failed to load credit cards");
      if (data.configured === false) {
        setConfigured(false);
        setCards([]);
        return;
      }
      setConfigured(true);
      setCards(data.cards ?? []);
      console.info("[useCreditCards] loaded", { count: data.cards?.length ?? 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      console.warn("[useCreditCards] load failed", e);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveCards = useCallback(
    async (next: CreditCard[]) => {
      const { res, data } = await fetchJson<{
        cards?: CreditCard[];
        error?: string;
      }>("/api/credit-cards", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: next }),
      });
      if (!res.ok) throw new Error(data.error ?? "Failed to save credit cards");
      setCards(data.cards ?? next);
      console.info("[useCreditCards] saved", { count: next.length });
    },
    []
  );

  return { cards, setCards, saveCards, loading, configured, error, reload: load };
}
