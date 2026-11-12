"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { BenefitClaim, BenefitInput, BenefitUsage } from "@/lib/benefits/types";
import { BenefitsContext } from "@/contexts/app-data-contexts";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import { useDomainEvent } from "@/hooks/useDomainEvent";

export function useBenefitsProvider(enabled: boolean) {
  const [benefits, setBenefits] = useState<BenefitUsage[]>([]);
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
        benefits?: BenefitUsage[];
        error?: string;
      }>("/api/benefits", { credentials: "include" });
      if (!res.ok || !data.configured) {
        setConfigured(false);
        setBenefits([]);
        return;
      }
      setConfigured(true);
      setBenefits(data.benefits ?? []);
      console.info("[useBenefits] loaded", { count: data.benefits?.length ?? 0 });
    } catch (e) {
      console.error("[useBenefits] load failed", e);
      setConfigured(false);
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

  useDomainEvent("benefits:changed", () => void load());

  const save = useCallback(
    async (incoming: BenefitInput[]) => {
      const { res, data } = await fetchJson<{ benefits?: BenefitUsage[]; error?: string }>(
        "/api/benefits",
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ benefits: incoming }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to save benefits");
      setBenefits(data.benefits ?? []);
      console.info("[useBenefits] saved", { count: data.benefits?.length ?? 0 });
      dispatchDomainEvent("benefits:changed");
    },
    []
  );

  const logClaim = useCallback(
    async (benefitId: string, input: { amount: number; claimedAt?: string; note?: string }) => {
      const { res, data } = await fetchJson<{ claim?: BenefitClaim; error?: string }>(
        `/api/benefits/${benefitId}/claims`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to log usage");
      dispatchDomainEvent("benefits:changed");
      await load();
    },
    [load]
  );

  const updateClaim = useCallback(
    async (
      benefitId: string,
      claimId: string,
      patch: { amount?: number; claimedAt?: string; note?: string }
    ) => {
      const { res, data } = await fetchJson<{ claim?: BenefitClaim; error?: string }>(
        `/api/benefits/${benefitId}/claims/${claimId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to update claim");
      dispatchDomainEvent("benefits:changed");
      await load();
    },
    [load]
  );

  const deleteClaim = useCallback(
    async (benefitId: string, claimId: string) => {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/benefits/${benefitId}/claims/${claimId}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to delete claim");
      dispatchDomainEvent("benefits:changed");
      await load();
    },
    [load]
  );

  return useMemo(
    () => ({
      benefits,
      loading,
      configured,
      reload: load,
      ensureLoaded,
      save,
      logClaim,
      updateClaim,
      deleteClaim,
    }),
    [benefits, loading, configured, load, ensureLoaded, save, logClaim, updateClaim, deleteClaim]
  );
}

export function useBenefits() {
  const ctx = useContext(BenefitsContext);
  if (!ctx) {
    throw new Error("useBenefits must be used within AppDataProvider");
  }
  useEffect(() => {
    ctx.ensureLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ensureLoaded only, not ctx itself
  }, [ctx.ensureLoaded]);
  return ctx;
}
