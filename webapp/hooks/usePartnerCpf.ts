"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { useHousehold } from "@/hooks/useHousehold";

export type PartnerCpf = {
  paired: boolean;
  partnerEmail: string | null;
  oa: number | null;
  latestMonthlyOA: number | null;
  latestContributionMonth: string | null;
};

/** Live OA snapshot for the caller's linked partner (BTO planner only) — fetched once the household is known to be paired. */
export function usePartnerCpf() {
  const { paired, configured } = useHousehold();
  const [data, setData] = useState<PartnerCpf | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!configured || !paired) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const { res, data: json } = await fetchJson<PartnerCpf & { error?: string }>(
        "/api/household/partner-cpf",
        { credentials: "include" }
      );
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to load partner CPF");
      }
      setData(json);
      console.info("[usePartnerCpf] loaded", { paired: json.paired, hasOA: json.oa != null });
    } catch (e) {
      console.error("[usePartnerCpf] load failed", e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [configured, paired]);

  useEffect(() => {
    void load();
  }, [load]);

  return { partnerCpf: data, loading, reload: load };
}
