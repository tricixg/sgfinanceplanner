"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createEmptyState, mergeWithDefaults } from "@/lib/finance/defaults";
import { fetchJson } from "@/lib/fetch-json";
import type { DashboardState, NetWorthSnapshot, PortfolioSnapshot } from "@/lib/types";
import type { FinanceProfile } from "@/lib/profile/load";
import type { CpfContribution, CpfTransaction } from "@/lib/cpf/types";
import type { AddCpfTransactionInput } from "@/lib/cpf/transactions";
import type { AddCpfContributionInput } from "@/lib/cpf/contributions";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import { AppDataContext } from "@/contexts/app-data-contexts";
import { resolveBudgetMonth } from "@/lib/budget/monthly";
import { currentYm } from "@/lib/finance/helpers";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import {
  assertDomainEditable,
  removedIds,
  type GuardedDomain,
  type LoadErrors,
} from "@/lib/sync/explicit-delete";

export const PORTFOLIO_HISTORY_LIMIT = 30;
export const NET_WORTH_HISTORY_LIMIT = 60;
export const CPF_CONTRIBUTIONS_LIMIT = 60;

/** Profile scalar fields synced by setState — extend when FinanceProfile grows. */
export const PROFILE_STATE_KEYS: (keyof FinanceProfile)[] = [
  "monthlySal",
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
  "milesPlanner",
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
  const [budgetMonths, setBudgetMonths] = useState<Record<string, DashboardState["budget"]>>({});
  const [incomeMonths, setIncomeMonths] = useState<Record<string, number>>({});
  const [creditCards, setCreditCards] = useState<DashboardState["creditCards"]>([]);
  const [holdings, setHoldings] = useState<DashboardState["holdings"]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<
    DashboardState["portfolioHistory"]
  >([]);
  const [prefs, setPrefs] = useState<DashboardState["prefs"]>({});
  const [otherLoans, setOtherLoans] = useState<DashboardState["otherLoans"]>([]);
  const [netWorthHistory, setNetWorthHistory] = useState<NetWorthSnapshot[]>([]);
  const [cpfContributions, setCpfContributions] = useState<CpfContribution[]>([]);
  const [cpfTransactions, setCpfTransactions] = useState<CpfTransaction[]>([]);

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
      budget: resolveBudgetMonth(budgetMonths, currentYm()).lines,
      budgetMonths,
      incomeMonths,
      creditCards,
      holdings,
      portfolioHistory,
      otherLoans,
      accounts: [],
      goals: [],
    });
  }, [profileBundle, loans, budgetMonths, incomeMonths, creditCards, holdings, portfolioHistory, prefs, otherLoans]);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Per-domain load failures. A domain that failed to load holds an empty list
  // that is NOT the user's real data, so its editing is blocked (see saveLoans /
  // saveCards / saveHoldings) and the UI shows a retry banner.
  const [loadErrors, setLoadErrors] = useState<LoadErrors>({});
  const loadErrorsRef = useRef(loadErrors);
  loadErrorsRef.current = loadErrors;
  const setDomainError = useCallback((domain: GuardedDomain, message: string | null) => {
    setLoadErrors((prev) => {
      if ((prev[domain] ?? null) === message) return prev;
      const next = { ...prev };
      if (message) next[domain] = message;
      else delete next[domain];
      return next;
    });
  }, []);

  // Raw lists exactly as loaded from the server — the baseline for "what did
  // the user remove" when saving.
  const loadedRef = useRef({ loans, creditCards, holdings });
  loadedRef.current = { loans, creditCards, holdings };

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

  const loadNetWorthHistory = useCallback(async () => {
    if (!enabled) return;
    try {
      const { res, data } = await fetchJson<{
        items?: NetWorthSnapshot[];
        configured?: boolean;
      }>(`/api/net-worth/snapshots?limit=${NET_WORTH_HISTORY_LIMIT}`, {
        credentials: "include",
      });
      if (res.ok) {
        setNetWorthHistory(data.items ?? []);
        console.info("[useAppData] net worth history loaded", {
          count: data.items?.length ?? 0,
        });
      }
    } catch (e) {
      console.warn("[useAppData] net worth history load failed", e);
    }
  }, [enabled]);

  const loadCpfContributions = useCallback(async () => {
    if (!enabled) return;
    try {
      const { res, data } = await fetchJson<{
        items?: CpfContribution[];
        configured?: boolean;
      }>(`/api/cpf/contributions?limit=${CPF_CONTRIBUTIONS_LIMIT}`, {
        credentials: "include",
      });
      if (res.ok) {
        setCpfContributions(data.items ?? []);
        console.info("[useAppData] cpf contributions loaded", {
          count: data.items?.length ?? 0,
        });
      }
    } catch (e) {
      console.warn("[useAppData] cpf contributions load failed", e);
    }
  }, [enabled]);

  const loadCpfTransactions = useCallback(async () => {
    if (!enabled) return;
    try {
      const { res, data } = await fetchJson<{ items?: CpfTransaction[] }>("/api/cpf/transactions", {
        credentials: "include",
      });
      if (res.ok) {
        setCpfTransactions(data.items ?? []);
        console.info("[useAppData] cpf transactions loaded", { count: data.items?.length ?? 0 });
      }
    } catch (e) {
      console.warn("[useAppData] cpf transactions load failed", e);
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
    void loadNetWorthHistory();
    void loadCpfContributions();
    void loadCpfTransactions();
    // A failed/throwing request resolves to `{ res.ok: false }` so one bad
    // domain can't hide behind (or break) the others.
    const safe = <T,>(p: Promise<{ res: Response; data: T }>) =>
      p.catch((e: unknown) => {
        console.warn("[useAppData] request failed", e);
        return { res: { ok: false, status: 0 } as Response, data: {} as T };
      });
    try {
      const [prefsRes, profRes, loansRes, otherLoansRes, budgetRes, cardsRes, holdRes] =
        await Promise.all([
          safe(fetchJson<{ data?: { prefs?: DashboardState["prefs"] }; configured?: boolean }>(
            "/api/state",
            { credentials: "include" }
          )),
          safe(fetchJson<ProfileBundle & { configured?: boolean }>("/api/profile", {
            credentials: "include",
          })),
          safe(fetchJson<{ loans?: DashboardState["loans"]; configured?: boolean }>(
            "/api/loans",
            { credentials: "include" }
          )),
          safe(fetchJson<{ otherLoans?: DashboardState["otherLoans"]; configured?: boolean }>(
            "/api/other-loans",
            { credentials: "include" }
          )),
          safe(fetchJson<{
            budget?: DashboardState["budget"];
            months?: Record<string, DashboardState["budget"]>;
            income?: Record<string, number>;
            currentYm?: string;
            configured?: boolean;
          }>(
            "/api/budget-lines",
            { credentials: "include" }
          )),
          safe(fetchJson<{ cards?: DashboardState["creditCards"]; configured?: boolean }>(
            "/api/credit-cards",
            { credentials: "include" }
          )),
          safe(fetchJson<{ holdings?: DashboardState["holdings"]; configured?: boolean }>(
            "/api/holdings",
            { credentials: "include" }
          )),
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
      setDomainError("loans", loansRes.res.ok ? null : "Couldn't load instalment plans");
      setDomainError("cards", cardsRes.res.ok ? null : "Couldn't load credit cards");
      setDomainError("holdings", holdRes.res.ok ? null : "Couldn't load holdings");
      if (otherLoansRes.res.ok) setOtherLoans(otherLoansRes.data.otherLoans ?? []);
      if (budgetRes.res.ok) {
        setBudgetMonths(budgetRes.data.months ?? {});
        setIncomeMonths(budgetRes.data.income ?? {});
      }
      if (cardsRes.res.ok) setCreditCards(cardsRes.data.cards ?? []);
      if (holdRes.res.ok) setHoldings(holdRes.data.holdings ?? []);

      console.info("[useAppData] core domains loaded");
    } catch (e) {
      console.warn("[useAppData] core load failed", e);
    } finally {
      setCoreLoading(false);
    }
  }, [enabled, loadSnapshots, loadNetWorthHistory, loadCpfContributions, loadCpfTransactions, setDomainError]);

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
      setDomainError("loans", null);
      console.info("[useAppData] reloadLoans ok", { count: data.loans?.length ?? 0 });
    } else {
      setDomainError("loans", "Couldn't load instalment plans");
    }
  }, [setDomainError]);

  const reloadHoldings = useCallback(async () => {
    const { res, data } = await fetchJson<{ holdings?: DashboardState["holdings"] }>(
      "/api/holdings",
      { credentials: "include" }
    );
    if (res.ok) {
      setHoldings(data.holdings ?? []);
      setDomainError("holdings", null);
      console.info("[useAppData] reloadHoldings ok", {
        count: data.holdings?.length ?? 0,
      });
    } else {
      setDomainError("holdings", "Couldn't load holdings");
    }
  }, [setDomainError]);

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

  // Dispatched by TabCards/CardPaymentModal (a statement payment can pay down
  // a linked BT loan) and OtherLoansPanel (direct edits) — nothing else keeps
  // the session-cached otherLoans in sync with those, so Debt and the net
  // worth liabilities breakdown would otherwise show stale balances until a
  // full reload.
  useDomainEvent(["otherLoans:changed"], () => {
    void reloadOtherLoans();
  });

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
    assertDomainEditable(loadErrorsRef.current, "loans");
    const deletedIds = removedIds(loadedRef.current.loans, next, (l) => l.id);
    const { res, data } = await fetchJson<{ loans?: DashboardState["loans"]; error?: string }>(
      "/api/loans",
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loans: next, deletedIds }),
      }
    );
    if (!res.ok) throw new Error(data.error ?? "Failed to save loans");
    setLoans(data.loans ?? next);
    dispatchDomainEvent("loans:changed");
  }, []);

  const saveBudgetMonth = useCallback(
    async (month: string, next: DashboardState["budget"]) => {
      if (!configured) {
        setBudgetMonths((prev) => ({ ...prev, [month]: next }));
        return;
      }
      const { res, data } = await fetchJson<{
        months?: Record<string, DashboardState["budget"]>;
        income?: Record<string, number>;
        error?: string;
      }>("/api/budget-lines", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, budget: next }),
      });
      if (!res.ok) throw new Error(data.error ?? "Failed to save budget");
      setBudgetMonths(data.months ?? {});
      setIncomeMonths(data.income ?? {});
      dispatchDomainEvent("budget:changed");
    },
    [configured]
  );

  const saveCards = useCallback(async (next: DashboardState["creditCards"]) => {
    assertDomainEditable(loadErrorsRef.current, "cards");
    const deletedCardKeys = removedIds(loadedRef.current.creditCards, next, (c) => c.id);
    const { res, data } = await fetchJson<{
      cards?: DashboardState["creditCards"];
      error?: string;
    }>(
      "/api/credit-cards",
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: next, deletedCardKeys }),
      }
    );
    if (!res.ok) throw new Error(data.error ?? "Failed to save cards");
    setCreditCards(data.cards ?? next);
    dispatchDomainEvent("cards:changed");
  }, []);

  const saveHoldings = useCallback(async (next: DashboardState["holdings"]) => {
    assertDomainEditable(loadErrorsRef.current, "holdings");
    const deletedIds = removedIds(loadedRef.current.holdings, next, (h) => h.id);
    const { res, data } = await fetchJson<{
      holdings?: DashboardState["holdings"];
      error?: string;
    }>(
      "/api/holdings",
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings: next, deletedIds }),
      }
    );
    if (!res.ok) throw new Error(data.error ?? "Failed to save holdings");
    setHoldings(data.holdings ?? next);
    dispatchDomainEvent("holdings:changed");
  }, []);

  const recordHoldingDividend = useCallback(
    async (
      holdingId: string,
      payload: { perShare: number; qty?: number; occurredAt?: string; note?: string }
    ) => {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/holdings/${holdingId}/dividends`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to record dividend");
      console.info("[useAppData] dividend recorded", { holdingId, ...payload });
      dispatchDomainEvent("holdings:changed");
      await reloadHoldings();
    },
    [reloadHoldings]
  );

  const deleteHoldingDividend = useCallback(
    async (holdingId: string, dividendId: string) => {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/holdings/${holdingId}/dividends/${dividendId}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to delete dividend");
      console.info("[useAppData] dividend deleted", { holdingId, dividendId });
      dispatchDomainEvent("holdings:changed");
      await reloadHoldings();
    },
    [reloadHoldings]
  );

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

  /**
   * Upserts the current month's net worth. Unlike appendSnapshot (one write per
   * day, first write wins), this always posts on every call — the stored value
   * for a month should reflect the latest known state as of that visit, so it
   * keeps approximating "month end" more closely the closer to month-end you are.
   */
  const appendNetWorthSnapshot = useCallback(async (snap: NetWorthSnapshot) => {
    await fetchJson("/api/net-worth/snapshots", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: snap }),
    });
    setNetWorthHistory((hist) => {
      const existingIdx = hist.findIndex((h) => h.month === snap.month);
      if (existingIdx === -1) {
        return [...hist, snap].slice(-NET_WORTH_HISTORY_LIMIT);
      }
      const existing = hist[existingIdx]!;
      if (existing.lnw === snap.lnw && existing.cpf === snap.cpf) {
        return hist;
      }
      const next = [...hist];
      next[existingIdx] = snap;
      return next;
    });
  }, []);

  const addCpfContribution = useCallback(
    async (input: {
      month: string;
      oa: number;
      sa: number;
      ma: number;
      note?: string;
      creditedOn?: string | null;
    }) => {
      const { res, data } = await fetchJson<{
        item?: CpfContribution;
        profile?: { oa: number; sa: number; ma: number };
        error?: string;
      }>("/api/cpf/contributions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok || !data.item) {
        throw new Error(data.error ?? "Failed to log CPF contribution");
      }
      const item = data.item;
      setCpfContributions((list) =>
        [...list, item].sort((a, b) => b.month.localeCompare(a.month))
      );
      if (data.profile) {
        const profile = data.profile;
        setProfileBundle((pb) => (pb ? { ...pb, profile: { ...pb.profile, ...profile } } : pb));
      }
      console.info("[useAppData] cpf contribution logged", { month: input.month });
    },
    []
  );

  const deleteCpfContribution = useCallback(async (id: string) => {
    const { res, data } = await fetchJson<{
      profile?: { oa: number; sa: number; ma: number };
      error?: string;
    }>(`/api/cpf/contributions/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error(data.error ?? "Failed to delete CPF contribution");
    setCpfContributions((list) => list.filter((c) => c.id !== id));
    if (data.profile) {
      const profile = data.profile;
      setProfileBundle((pb) => (pb ? { ...pb, profile: { ...pb.profile, ...profile } } : pb));
    }
    console.info("[useAppData] cpf contribution deleted", { id });
  }, []);

  const addCpfTransaction = useCallback(async (input: AddCpfTransactionInput) => {
    const { res, data } = await fetchJson<{ item?: CpfTransaction; oa?: number; error?: string }>(
      "/api/cpf/transactions",
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    );
    if (!res.ok || !data.item) throw new Error(data.error ?? "Failed to log CPF transaction");
    const item = data.item;
    setCpfTransactions((list) =>
      [item, ...list].sort(
        (a, b) => b.txnDate.localeCompare(a.txnDate) || b.createdAt.localeCompare(a.createdAt)
      )
    );
    if (typeof data.oa === "number") {
      const oa = data.oa;
      setProfileBundle((pb) => (pb ? { ...pb, profile: { ...pb.profile, oa } } : pb));
    }
    dispatchDomainEvent(["cpf:changed", "profile:changed"]);
    console.info("[useAppData] cpf transaction logged", { category: input.category });
  }, []);

  const deleteCpfTransaction = useCallback(async (id: string) => {
    const { res, data } = await fetchJson<{ oa?: number; error?: string }>(
      `/api/cpf/transactions/${id}`,
      { method: "DELETE", credentials: "include" }
    );
    if (!res.ok) throw new Error(data.error ?? "Failed to delete CPF transaction");
    setCpfTransactions((list) => list.filter((t) => t.id !== id));
    if (typeof data.oa === "number") {
      const oa = data.oa;
      setProfileBundle((pb) => (pb ? { ...pb, profile: { ...pb.profile, oa } } : pb));
    }
    dispatchDomainEvent(["cpf:changed", "profile:changed"]);
    console.info("[useAppData] cpf transaction deleted", { id });
  }, []);

  const updateCpfTransaction = useCallback(async (id: string, input: AddCpfTransactionInput) => {
    const { res, data } = await fetchJson<{ item?: CpfTransaction; oa?: number; error?: string }>(
      `/api/cpf/transactions/${id}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    );
    if (!res.ok || !data.item) throw new Error(data.error ?? "Failed to update CPF transaction");
    const item = data.item;
    setCpfTransactions((list) =>
      list
        .map((t) => (t.id === id ? item : t))
        .sort((a, b) => b.txnDate.localeCompare(a.txnDate) || b.createdAt.localeCompare(a.createdAt))
    );
    if (typeof data.oa === "number") {
      const oa = data.oa;
      setProfileBundle((pb) => (pb ? { ...pb, profile: { ...pb.profile, oa } } : pb));
    }
    dispatchDomainEvent(["cpf:changed", "profile:changed"]);
    console.info("[useAppData] cpf transaction updated", { id });
  }, []);

  const updateCpfContribution = useCallback(async (id: string, input: AddCpfContributionInput) => {
    const { res, data } = await fetchJson<{
      item?: CpfContribution;
      profile?: { oa: number; sa: number; ma: number };
      error?: string;
    }>(`/api/cpf/contributions/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok || !data.item) throw new Error(data.error ?? "Failed to update CPF contribution");
    const item = data.item;
    setCpfContributions((list) =>
      list.map((c) => (c.id === id ? item : c)).sort((a, b) => b.month.localeCompare(a.month))
    );
    if (data.profile) {
      const profile = data.profile;
      setProfileBundle((pb) => (pb ? { ...pb, profile: { ...pb.profile, ...profile } } : pb));
    }
    dispatchDomainEvent(["cpf:changed", "profile:changed"]);
    console.info("[useAppData] cpf contribution updated", { id });
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
      if (next.budgetMonths !== prev.budgetMonths && next.budgetMonths) {
        setBudgetMonths(next.budgetMonths);
      } else if (next.budget !== prev.budget) {
        setBudgetMonths((m) => ({ ...m, [currentYm()]: next.budget }));
      }
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
    loadErrors,
    reload: load,
    reloadLoans,
    reloadOtherLoans,
    reloadHoldings,
    reloadSnapshots: loadSnapshots,
    saveProfile,
    saveProfilePolicies,
    saveLoans,
    saveBudgetMonth,
    saveCards,
    saveHoldings,
    recordHoldingDividend,
    deleteHoldingDividend,
    savePrefs,
    appendSnapshot,
    netWorthHistory,
    reloadNetWorthHistory: loadNetWorthHistory,
    appendNetWorthSnapshot,
    cpfContributions,
    reloadCpfContributions: loadCpfContributions,
    addCpfContribution,
    deleteCpfContribution,
    updateCpfContribution,
    cpfTransactions,
    reloadCpfTransactions: loadCpfTransactions,
    addCpfTransaction,
    deleteCpfTransaction,
    updateCpfTransaction,
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
