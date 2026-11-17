"use client";

import { useCallback, useEffect, useState } from "react";
import type { CpfTransaction } from "@/lib/cpf/types";
import { fetchJson } from "@/lib/fetch-json";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import { useHousehold } from "@/hooks/useHousehold";

/** The linked partner's BTO-tagged payments (BTO planner only) — empty when unpaired. */
export function usePartnerBtoPayments() {
  const { paired, configured } = useHousehold();
  const [items, setItems] = useState<CpfTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!configured || !paired) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const { res, data } = await fetchJson<{ items?: CpfTransaction[]; error?: string }>(
        "/api/household/partner-bto-payments",
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to load partner BTO payments");
      setItems(data.items ?? []);
      console.info("[usePartnerBtoPayments] loaded", { count: data.items?.length ?? 0 });
    } catch (e) {
      console.error("[usePartnerBtoPayments] load failed", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [configured, paired]);

  useEffect(() => {
    void load();
  }, [load]);
  useDomainEvent("cpf:changed", () => void load());

  return { partnerPayments: items, loading, reload: load };
}
