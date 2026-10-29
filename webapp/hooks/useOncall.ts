"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { DEFAULT_ONCALL_SETTINGS } from "@/lib/oncall/calc";
import type {
  OncallBundle,
  OncallEntryInput,
  OncallPaymentInput,
  OncallSettings,
} from "@/lib/oncall/types";
import { dispatchDomainEvent, type DomainEventName } from "@/lib/events/domain-events";
import { useDomainEvent } from "@/hooks/useDomainEvent";

const EMPTY: OncallBundle = { settings: DEFAULT_ONCALL_SETTINGS, entries: [], payments: [] };

/** Deposits move account balances and income, so payment changes refresh those pages too. */
const PAYMENT_EVENTS: DomainEventName[] = ["oncall:changed", "accounts:changed", "savings:changed"];

export function useOncall(enabled: boolean) {
  const [bundle, setBundle] = useState<OncallBundle>(EMPTY);
  const [loading, setLoading] = useState(enabled);
  const [configured, setConfigured] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { res, data } = await fetchJson<Partial<OncallBundle> & {
        configured?: boolean;
        error?: string;
      }>("/api/oncall", { credentials: "include" });
      if (!res.ok || !data.configured) {
        setConfigured(false);
        setBundle(EMPTY);
        if (data.error) console.error("[useOncall] load failed", data.error);
        return;
      }
      setConfigured(true);
      setBundle({
        settings: data.settings ?? DEFAULT_ONCALL_SETTINGS,
        entries: data.entries ?? [],
        payments: data.payments ?? [],
      });
      console.info("[useOncall] loaded", {
        entries: data.entries?.length ?? 0,
        payments: data.payments?.length ?? 0,
      });
    } catch (e) {
      console.error("[useOncall] load failed", e);
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  // A deposit deleted from transaction history unlinks its payment.
  useDomainEvent(["oncall:changed", "savings:changed"], () => void load());

  const mutate = useCallback(
    async (
      url: string,
      method: "POST" | "PUT" | "PATCH" | "DELETE",
      body: unknown,
      events: DomainEventName[],
      fallbackError: string
    ) => {
      const { res, data } = await fetchJson<Partial<OncallBundle> & { error?: string }>(url, {
        method,
        credentials: "include",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) throw new Error(data.error ?? fallbackError);
      setBundle({
        settings: data.settings ?? DEFAULT_ONCALL_SETTINGS,
        entries: data.entries ?? [],
        payments: data.payments ?? [],
      });
      dispatchDomainEvent(events);
    },
    []
  );

  const saveSettings = useCallback(
    (settings: OncallSettings) =>
      mutate("/api/oncall/settings", "PUT", { settings }, ["oncall:changed"], "Failed to save settings"),
    [mutate]
  );

  const addEntry = useCallback(
    (input: OncallEntryInput) =>
      mutate("/api/oncall/entries", "POST", input, ["oncall:changed"], "Failed to log on-call days"),
    [mutate]
  );

  const updateEntry = useCallback(
    (id: string, input: OncallEntryInput) =>
      mutate(`/api/oncall/entries/${id}`, "PATCH", input, ["oncall:changed"], "Failed to save"),
    [mutate]
  );

  const deleteEntry = useCallback(
    (id: string) =>
      mutate(`/api/oncall/entries/${id}`, "DELETE", undefined, ["oncall:changed"], "Failed to delete"),
    [mutate]
  );

  const applyRateToAll = useCallback(
    (dailyRate: number) =>
      mutate("/api/oncall/entries/apply-rate", "POST", { dailyRate }, ["oncall:changed"], "Failed to update entries"),
    [mutate]
  );

  const recordPayment = useCallback(
    (input: OncallPaymentInput) =>
      mutate("/api/oncall/payments", "POST", input, PAYMENT_EVENTS, "Failed to record payment"),
    [mutate]
  );

  const deletePayment = useCallback(
    (id: string) =>
      mutate(`/api/oncall/payments/${id}`, "DELETE", undefined, PAYMENT_EVENTS, "Failed to delete payment"),
    [mutate]
  );

  return {
    ...bundle,
    loading,
    configured,
    reload: load,
    saveSettings,
    addEntry,
    updateEntry,
    deleteEntry,
    applyRateToAll,
    recordPayment,
    deletePayment,
  };
}
