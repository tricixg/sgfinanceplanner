"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createEmptyState, mergeWithDefaults } from "@/lib/finance/defaults";
import { fetchJson } from "@/lib/fetch-json";
import type { DashboardState, PortfolioSnapshot } from "@/lib/types";
import type { FinanceProfile } from "@/lib/profile/load";
import { AppDataContext } from "@/contexts/app-data-contexts";
import { dispatchDomainEvent } from "@/lib/events/domain-events";

export const PORTFOLIO_HISTORY_LIMIT = 30;

/** Profile scalar fields synced by setState — extend when FinanceProfile grows. */
export const PROFILE_STATE_KEYS: (keyof FinanceProfile)[] = [
  "monthlySal",
  "comms",
  "salaryCreditDay",
  "oa",
  "sa",
  "ma",
  "moo",
  "margin",
  "cash",
  "ccDebt",
  "cashflowStartYm",
  "btoPlanner",
];

type ProfileBundle = {
  profile: FinanceProfile;
  insurancePolicies: DashboardState["insurancePolicies"];
  ilpPolicies: DashboardState["ilpPolicies"];
};

/**
 * Composes DashboardState from normalized domain APIs (no monolithic /api/state).
 */
export function useAppDataProvider(enabled: boolean) {
  const [coreLoading, setCoreLoading] = useState(enabled);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [profileBundle, setProfileBundle] = useState<ProfileBundle | null>(null);
  const [loans, setLoans] = useState<DashboardState["loans"]>([]);
  const [budget, setBudget] = useState<DashboardState["budget"]>([]);
  const [creditCards, setCreditCards] = useState<DashboardState["creditCards"]>([]);
  const [holdings, setHoldings] = useState<DashboardState["holdings"]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<
    DashboardState["portfolioHistory"]
  >([]);
  const [prefs, setPrefs] = useState<DashboardState["prefs"]>({});
  const [otherLoans, setOtherLoans] = useState<DashboardState["otherLoans"]>([]);

  const state = useMemo((): DashboardState => {
    const base = createEmptyState();
    const p = profileBundle?.profile;
    return mergeWithDefaults({
      ...base,
      ...(p ?? {}),
      prefs,
      insurancePolicies: profileBundle?.insurancePolicies ?? [],
      ilpPolicies: profileBundle?.ilpPolicies ?? [],
      loans,
      budget,
      creditCards,
      holdings,
      portfolioHistory,
      otherLoans,
      accounts: [],
      goals: [],
    });
  }, [profileBundle, loans, budget, creditCards, holdings, portfolioHistory, prefs, otherLoans]);

  const stateRef = useRef(state);
  stateRef.current = state;

  const loadSnapshots = useCallback(async () => {
    if (!enabled) return;
    setSnapshotsLoading(true);
    try {
      const { res, data } = await fetchJson<{
        items?: DashboardState["portfolioHistory"];
        configured?: boolean;
      }>(`/api/portfolio/snapshots?limit=${PORTFOLIO_HISTORY_LIMIT}`, {
        credentials: "include",
      });
      if (res.ok) {
        setPortfolioHistory(data.items ?? []);
        console.info("[useAppData] portfolio snapshots loaded", {
          count: data.items?.length ?? 0,
        });
      }
    } catch (e) {
      console.warn("[useAppData] portfolio snapshots load failed", e);
    } finally {
      setSnapshotsLoading(false);
    }
  }, [enabled]);

  const load = useCallback(async () => {
    if (!enabled) {
      setCoreLoading(false);
      setSnapshotsLoading(false);
      return;
    }
    setCoreLoading(true);
    void loadSnapshots();
    try {
      const [prefsRes, profRes, loansRes, otherLoansRes, budgetRes, cardsRes, holdRes] =
        await Promise.all([
          fetchJson<{ data?: { prefs?: DashboardState["prefs"] }; configured?: boolean }>(
            "/api/state",
            { credentials: "include" }
          ),
          fetchJson<ProfileBundle & { configured?: boolean }>("/api/profile", {
            credentials: "include",
          }),
          fetchJson<{ loans?: DashboardState["loans"]; configured?: boolean }>(
            "/api/loans",
            { credentials: "include" }
          ),
          fetchJson<{ otherLoans?: DashboardState["otherLoans"]; configured?: boolean }>(
            "/api/other-loans",
            { credentials: "include" }
          ),
          fetchJson<{ budget?: DashboardState["budget"]; configured?: boolean }>(
            "/api/budget-lines",
            { credentials: "include" }
          ),
          fetchJson<{ cards?: DashboardState["creditCards"]; configured?: boolean }>(
            "/api/credit-cards",
            { credentials: "include" }
          ),
          fetchJson<{ holdings?: DashboardState["holdings"]; configured?: boolean }>(
            "/api/holdings",
            { credentials: "include" }
          ),
        ]);

      setConfigured(profRes.data.configured !== false);
      if (prefsRes.res.ok && prefsRes.data.data?.prefs) {
        setPrefs(prefsRes.data.data.prefs);
      }
      if (profRes.res.ok && profRes.data.profile) {
        setProfileBundle({
          profile: profRes.data.profile,
          insurancePolicies: profRes.data.insurancePolicies ?? [],
          ilpPolicies: profRes.data.ilpPolicies ?? [],
        });
      }
      if (loansRes.res.ok) setLoans(loansRes.data.loans ?? []);
      if (otherLoansRes.res.ok) setOtherLoans(otherLoansRes.data.otherLoans ?? []);
      if (budgetRes.res.ok) setBudget(budgetRes.data.budget ?? []);
      if (cardsRes.res.ok) setCreditCards(cardsRes.data.cards ?? []);
      if (holdRes.res.ok) setHoldings(holdRes.data.holdings ?? []);

      console.info("[useAppData] core domains loaded");
    } catch (e) {
      console.warn("[useAppData] core load failed", e);
    } finally {
      setCoreLoading(false);
    }
  }, [enabled, loadSnapshots]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadLoans = useCallback(async () => {
    const { res, data } = await fetchJson<{ loans?: DashboardState["loans"] }>(
      "/api/loans",
      { credentials: "include" }
    );
    if (res.ok) {
      setLoans(data.loans ?? []);
      console.info("[useAppData] reloadLoans ok", { count: data.loans?.length ?? 0 });
    }
  }, []);

  const reloadOtherLoans = useCallback(async () => {
    const { res, data } = await fetchJson<{ otherLoans?: DashboardState["otherLoans"] }>(
      "/api/other-loans",
      { credentials: "include" }
    );
    if (res.ok) {
      setOtherLoans(data.otherLoans ?? []);
      console.info("[useAppData] reloadOtherLoans ok", {
        count: data.otherLoans?.length ?? 0,
      });
    }
  }, []);

  const patchProfile = useCallback(
    async (patch: Partial<FinanceProfile>) => {
      const { res, data } = await fetchJson<ProfileBundle & { error?: string }>(
        "/api/profile",
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: patch }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to save profile");
      setProfileBundle({
        profile: data.profile!,
        insurancePolicies: data.insurancePolicies ?? [],
        ilpPolicies: data.ilpPolicies ?? [],
      });
    },
    []
  );

  const saveLoans = useCallback(async (next: DashboardState["loans"]) => {
    const { res, data } = await fetchJson<{ loans?: DashboardState["loans"] }>(
      "/api/loans",
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loans: next }),
      }
    );
    if (!res.ok) throw new Error("Failed to save loans");
    setLoans(data.loans ?? next);
    dispatchDomainEvent("loans:changed");
  }, []);

  const saveBudget = useCallback(async (next: DashboardState["budget"]) => {
    const { res, data } = await fetchJson<{ budget?: DashboardState["budget"] }>(
      "/api/budget-lines",
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget: next }),
      }
    );
    if (!res.ok) throw new Error("Failed to save budget");
    setBudget(data.budget ?? next);
    dispatchDomainEvent("budget:changed");
  }, []);

  const saveCards = useCallback(async (next: DashboardState["creditCards"]) => {
    const { res, data } = await fetchJson<{ cards?: DashboardState["creditCards"] }>(
      "/api/credit-cards",
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: next }),
      }
    );
    if (!res.ok) throw new Error("Failed to save cards");
    setCreditCards(data.cards ?? next);
    dispatchDomainEvent("cards:changed");
  }, []);

  const saveHoldings = useCallback(async (next: DashboardState["holdings"]) => {
    const { res, data } = await fetchJson<{ holdings?: DashboardState["holdings"] }>(
      "/api/holdings",
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings: next }),
      }
    );
    if (!res.ok) throw new Error("Failed to save holdings");
    setHoldings(data.holdings ?? next);
    dispatchDomainEvent("holdings:changed");
  }, []);

  const appendSnapshot = useCallback(async (snap: PortfolioSnapshot) => {
    let shouldPost = true;
    setPortfolioHistory((hist) => {
      const existingIdx = hist.findIndex((h) => h.recordedAt === snap.recordedAt);
      if (existingIdx === -1) return hist;
      shouldPost = false;
      const next = [...hist];
      next[existingIdx] = snap;
      return next;
    });
    if (!shouldPost) {
      console.info("[useAppData] skip snapshot insert (already recorded today)", {
        recordedAt: snap.recordedAt,
      });
      return;
    }
    await fetchJson("/api/portfolio/snapshots", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: snap }),
    });
    setPortfolioHistory((hist) => {
      const next = [...hist, snap].slice(-PORTFOLIO_HISTORY_LIMIT);
      return next;
    });
  }, []);

  const savePrefs = useCallback(async (nextPrefs: DashboardState["prefs"]) => {
    const { res } = await fetchJson("/api/state", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { prefs: nextPrefs } }),
    });
    if (!res.ok) throw new Error("Failed to save preferences");
    setPrefs(nextPrefs);
  }, []);

  const saveProfilePolicies = useCallback(
    async (patch: {
      insurancePolicies?: DashboardState["insurancePolicies"];
      ilpPolicies?: DashboardState["ilpPolicies"];
    }) => {
      const { res, data } = await fetchJson<ProfileBundle & { error?: string }>(
        "/api/profile",
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to save profile");
      setProfileBundle({
        profile: data.profile!,
        insurancePolicies: data.insurancePolicies ?? [],
        ilpPolicies: data.ilpPolicies ?? [],
      });
      dispatchDomainEvent("profile:changed");
      console.info("[useAppData] saved profile policies", {
        insurance: patch.insurancePolicies?.length,
        ilp: patch.ilpPolicies?.length,
      });
    },
    []
  );

  /** Update in-memory dashboard state only — persist via save* methods or tab Save buttons. */
  const setState = useCallback(
    (updater: DashboardState | ((prev: DashboardState) => DashboardState)) => {
      const prev = stateRef.current;
      const next = typeof updater === "function" ? updater(prev) : updater;

      if (next.loans !== prev.loans) setLoans(next.loans);
      if (next.budget !== prev.budget) setBudget(next.budget);
      if (next.creditCards !== prev.creditCards) setCreditCards(next.creditCards);
      if (next.holdings !== prev.holdings) setHoldings(next.holdings);
      if (next.prefs !== prev.prefs) setPrefs(next.prefs);
      if (next.otherLoans !== prev.otherLoans) setOtherLoans(next.otherLoans ?? []);

      const profilePatch: Partial<FinanceProfile> = {};
      for (const key of PROFILE_STATE_KEYS) {
        if (next[key] !== prev[key]) {
          Object.assign(profilePatch, { [key]: next[key] });
        }
      }

      if (Object.keys(profilePatch).length) {
        setProfileBundle((pb) =>
          pb
            ? { ...pb, profile: { ...pb.profile, ...profilePatch } }
            : {
                profile: profilePatch as FinanceProfile,
                insurancePolicies: [],
                ilpPolicies: [],
              }
        );
      }

      if (
        next.insurancePolicies !== prev.insurancePolicies ||
        next.ilpPolicies !== prev.ilpPolicies
      ) {
        setProfileBundle((pb) =>
          pb
            ? {
                ...pb,
                insurancePolicies: next.insurancePolicies,
                ilpPolicies: next.ilpPolicies,
              }
            : null
        );
      }

      if (next.portfolioHistory !== prev.portfolioHistory) {
        setPortfolioHistory(next.portfolioHistory);
      }
    },
    []
  );

  const saveProfile = useCallback(
    async (patch: Partial<FinanceProfile>) => {
      setProfileBundle((pb) =>
        pb
          ? { ...pb, profile: { ...pb.profile, ...patch } }
          : {
              profile: { ...createEmptyState(), ...patch } as FinanceProfile,
              insurancePolicies: [],
              ilpPolicies: [],
            }
      );
      await patchProfile(patch);
      dispatchDomainEvent("profile:changed");
      console.info("[useAppData] saveProfile ok", { keys: Object.keys(patch) });
    },
    [patchProfile]
  );

  return {
    state,
    setState,
    loading: coreLoading,
    coreLoading,
    snapshotsLoading,
    configured,
    reload: load,
    reloadLoans,
    reloadOtherLoans,
    reloadSnapshots: loadSnapshots,
    saveProfile,
    saveProfilePolicies,
    saveLoans,
    saveBudget,
    saveCards,
    saveHoldings,
    savePrefs,
    appendSnapshot,
    cardsApi: configured
      ? { cards: creditCards, saveCards, configured: true as const }
      : undefined,
  };
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error("useAppData must be used within AppDataProvider");
  }
  return ctx;
}
