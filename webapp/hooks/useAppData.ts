"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createEmptyState, mergeWithDefaults } from "@/lib/finance/defaults";
import {
  ALL_DOMAINS,
  CONTEXT_FIELD_DOMAIN,
  CORE_DOMAINS,
  DATA_DOMAINS,
  DOMAIN_LABEL,
  STATE_FIELD_DOMAIN,
  isSettled,
  type DataDomain,
  type DomainStatus,
} from "@/lib/app/domains";
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
import { createLatestWinsWriter } from "@/lib/net-worth/latest-wins";
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
const DOMAIN_GUARD = process.env.NEXT_PUBLIC_DOMAIN_GUARD === "1";

const IDLE_STATUS: Record<DataDomain, DomainStatus> = Object.fromEntries(
  DATA_DOMAINS.map((d) => [d, "idle" as const])
) as Record<DataDomain, DomainStatus>;

/**
 * Turn the fields of domains that nobody has requested yet into accessors that request the
 * domain when read. A page that reads data it did not declare therefore loads it (and
 * re-renders when it arrives) instead of silently showing an empty default as if it were the
 * user's real data. Fields of requested domains stay plain properties, so the common path
 * pays nothing.
 */
function withLazyDomains<T extends object>(
  obj: T,
  fieldDomain: Readonly<Record<string, DataDomain>>,
  isRequested: (d: DataDomain) => boolean,
  request: (d: DataDomain, field: string) => void
): T {
  for (const [field, domain] of Object.entries(fieldDomain)) {
    if (isRequested(domain) || !(field in obj)) continue;
    const value = (obj as Record<string, unknown>)[field];
    Object.defineProperty(obj, field, {
      enumerable: true,
      configurable: true,
      get() {
        request(domain, field);
        return value;
      },
    });
  }
  return obj;
}

export function useAppDataProvider(
  enabled: boolean,
  needs: readonly DataDomain[] = ALL_DOMAINS
) {
  const [domainStatus, setDomainStatusState] = useState<Record<DataDomain, DomainStatus>>(IDLE_STATUS);
  const statusRef = useRef<Record<DataDomain, DomainStatus>>(IDLE_STATUS);
  const setDomainStatus = useCallback((d: DataDomain, status: DomainStatus) => {
    // The ref is updated synchronously so concurrent ensureDomains() calls never double-load.
    if (statusRef.current[d] === status) return;
    statusRef.current = { ...statusRef.current, [d]: status };
    setDomainStatusState(statusRef.current);
  }, []);
  const [configured, setConfigured] = useState(false);
  const [profileBundle, setProfileBundle] = useState<ProfileBundle | null>(null);
  const [loans, setLoans] = useState<DashboardState["loans"]>([]);
  const [budgetMonths, setBudgetMonths] = useState<Record<string, DashboardState["budget"]>>({});
  const [incomeMonths, setIncomeMonths] = useState<Record<string, number>>({});
  const [computedMonths, setComputedMonths] = useState<DashboardState["computedMonths"]>({});
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

  // Domains that have been asked for (anything not "idle"). Its key changes only when a new
  // domain is first requested, which is when the lazy accessors below must be rebuilt.
  const requestedKey = DATA_DOMAINS.filter((d) => domainStatus[d] !== "idle").join(",");
  const isRequested = useCallback((d: DataDomain) => statusRef.current[d] !== "idle", []);
  const ensureDomainsRef = useRef<(d: readonly DataDomain[]) => void>(() => {});
  const requestFromRead = useCallback((domain: DataDomain, field: string) => {
    if (DOMAIN_GUARD && typeof window !== "undefined") {
      console.warn("[domain-guard] read before requested", { domain, field });
      const w = window as unknown as { __domainGuard?: { domain: string; field: string }[] };
      (w.__domainGuard ??= []).push({ domain, field });
    }
    // Never start a load (a state update) while rendering: defer it.
    queueMicrotask(() => ensureDomainsRef.current([domain]));
  }, []);

  const state = useMemo((): DashboardState => {
    const base = createEmptyState();
    const p = profileBundle?.profile;
    const composed = mergeWithDefaults({
      ...base,
      ...(p ?? {}),
      prefs,
      insurancePolicies: profileBundle?.insurancePolicies ?? [],
      ilpPolicies: profileBundle?.ilpPolicies ?? [],
      loans,
      budget: resolveBudgetMonth(budgetMonths, currentYm()).lines,
      budgetMonths,
      incomeMonths,
      computedMonths,
      creditCards,
      holdings,
      portfolioHistory,
      otherLoans,
      accounts: [],
      goals: [],
    });
    return withLazyDomains(composed, STATE_FIELD_DOMAIN, isRequested, requestFromRead);
    // requestedKey: rebuild when a domain is first requested (accessors -> plain values).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileBundle, loans, budgetMonths, incomeMonths, computedMonths, creditCards, holdings, portfolioHistory, prefs, otherLoans, requestedKey, isRequested, requestFromRead]);

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

  /**
   * Whole-list and whole-object saves must never run against data that was not (successfully)
   * loaded: an empty default would overwrite the user's real rows. A domain that was never
   * requested, is still loading, or failed to load is not editable.
   */
  const assertDomainLoaded = useCallback((domain: DataDomain) => {
    if (statusRef.current[domain] !== "ready") {
      throw new Error(
        `${DOMAIN_LABEL[domain]} haven't finished loading — reload and try again.`
      );
    }
  }, []);

  // A failed/throwing request resolves to `{ res.ok: false }` so one bad domain can't hide
  // behind (or break) the others.
  const safe = useCallback(
    <T,>(p: Promise<{ res: Response; data: T }>) =>
      p.catch((e: unknown) => {
        console.warn("[useAppData] request failed", e);
        return { res: { ok: false, status: 0 } as Response, data: {} as T };
      }),
    []
  );

  /** Fetch one domain and apply it; (re)loading sets its status to loading, then ready/error. */
  const loadDomain = useCallback(
    async (d: DataDomain): Promise<void> => {
      if (!enabled) return;
      setDomainStatus(d, "loading");
      const opts = { credentials: "include" as const };
      let ok = true;
      try {
        switch (d) {
          case "prefs": {
            const { res, data } = await safe(
              fetchJson<{ data?: { prefs?: DashboardState["prefs"] } }>("/api/state", opts)
            );
            if (res.ok && data.data?.prefs) setPrefs(data.data.prefs);
            ok = res.ok;
            break;
          }
          case "profile": {
            const { res, data } = await safe(
              fetchJson<ProfileBundle & { configured?: boolean }>("/api/profile", opts)
            );
            setConfigured(data.configured !== false);
            ok = Boolean(res.ok && data.profile);
            if (ok) {
              setProfileBundle({
                profile: data.profile,
                insurancePolicies: data.insurancePolicies ?? [],
                ilpPolicies: data.ilpPolicies ?? [],
              });
            }
            setDomainError("profile", ok ? null : "Couldn't load your profile");
            break;
          }
          case "loans": {
            const { res, data } = await safe(
              fetchJson<{ loans?: DashboardState["loans"]; configured?: boolean }>("/api/loans", opts)
            );
            setConfigured(data.configured !== false);
            if (res.ok) setLoans(data.loans ?? []);
            ok = res.ok;
            setDomainError("loans", ok ? null : "Couldn't load instalment plans");
            break;
          }
          case "otherLoans": {
            const { res, data } = await safe(
              fetchJson<{ otherLoans?: DashboardState["otherLoans"]; configured?: boolean }>(
                "/api/other-loans",
                opts
              )
            );
            setConfigured(data.configured !== false);
            if (res.ok) setOtherLoans(data.otherLoans ?? []);
            ok = res.ok;
            setDomainError("otherLoans", ok ? null : "Couldn't load personal and balance-transfer loans");
            break;
          }
          case "budget": {
            const { res, data } = await safe(
              fetchJson<{
                months?: Record<string, DashboardState["budget"]>;
                income?: Record<string, number>;
                computed?: DashboardState["computedMonths"];
                configured?: boolean;
              }>("/api/budget-lines", opts)
            );
            setConfigured(data.configured !== false);
            if (res.ok) {
              setBudgetMonths(data.months ?? {});
              setIncomeMonths(data.income ?? {});
              setComputedMonths(data.computed ?? {});
            }
            ok = res.ok;
            break;
          }
          case "cards": {
            const { res, data } = await safe(
              fetchJson<{ cards?: DashboardState["creditCards"]; configured?: boolean }>(
                "/api/credit-cards",
                opts
              )
            );
            setConfigured(data.configured !== false);
            if (res.ok) setCreditCards(data.cards ?? []);
            ok = res.ok;
            setDomainError("cards", ok ? null : "Couldn't load credit cards");
            break;
          }
          case "holdings": {
            const { res, data } = await safe(
              fetchJson<{ holdings?: DashboardState["holdings"]; configured?: boolean }>(
                "/api/holdings",
                opts
              )
            );
            setConfigured(data.configured !== false);
            if (res.ok) setHoldings(data.holdings ?? []);
            ok = res.ok;
            setDomainError("holdings", ok ? null : "Couldn't load holdings");
            break;
          }
          case "snapshots": {
            const { res, data } = await safe(
              fetchJson<{ items?: DashboardState["portfolioHistory"] }>(
                `/api/portfolio/snapshots?limit=${PORTFOLIO_HISTORY_LIMIT}`,
                opts
              )
            );
            if (res.ok) setPortfolioHistory(data.items ?? []);
            ok = res.ok;
            break;
          }
          case "netWorth": {
            const { res, data } = await safe(
              fetchJson<{ items?: NetWorthSnapshot[] }>(
                `/api/net-worth/snapshots?limit=${NET_WORTH_HISTORY_LIMIT}`,
                opts
              )
            );
            if (res.ok) setNetWorthHistory(data.items ?? []);
            ok = res.ok;
            break;
          }
          case "cpfContributions": {
            const { res, data } = await safe(
              fetchJson<{ items?: CpfContribution[] }>(
                `/api/cpf/contributions?limit=${CPF_CONTRIBUTIONS_LIMIT}`,
                opts
              )
            );
            if (res.ok) setCpfContributions(data.items ?? []);
            ok = res.ok;
            break;
          }
          case "cpfTransactions": {
            const { res, data } = await safe(
              fetchJson<{ items?: CpfTransaction[] }>("/api/cpf/transactions", opts)
            );
            if (res.ok) setCpfTransactions(data.items ?? []);
            ok = res.ok;
            break;
          }
        }
      } catch (e) {
        console.warn("[useAppData] domain load failed", { domain: d, e });
        ok = false;
      }
      console.info("[useAppData] domain loaded", { domain: d, ok });
      setDomainStatus(d, ok ? "ready" : "error");
    },
    [enabled, safe, setDomainStatus, setDomainError]
  );

  /** Start loading the domains that have not been requested yet (idempotent). */
  const ensureDomains = useCallback(
    (domains: readonly DataDomain[]) => {
      if (!enabled) return;
      for (const d of domains) {
        if (statusRef.current[d] === "idle") void loadDomain(d);
      }
    },
    [enabled, loadDomain]
  );
  ensureDomainsRef.current = ensureDomains;

  const loadSnapshots = useCallback(() => loadDomain("snapshots"), [loadDomain]);
  const loadNetWorthHistory = useCallback(() => loadDomain("netWorth"), [loadDomain]);
  const loadCpfContributions = useCallback(() => loadDomain("cpfContributions"), [loadDomain]);
  const loadCpfTransactions = useCallback(() => loadDomain("cpfTransactions"), [loadDomain]);

  /** Reload every domain that has been requested. */
  const load = useCallback(async () => {
    if (!enabled) return;
    const requested = DATA_DOMAINS.filter((d) => statusRef.current[d] !== "idle");
    await Promise.all(requested.map((d) => loadDomain(d)));
  }, [enabled, loadDomain]);

  // Load what the current route needs.
  useEffect(() => {
    ensureDomains(needs);
  }, [ensureDomains, needs]);

  const settled = (d: DataDomain) => isSettled(domainStatus[d]);
  // Strict gate for work that needs every core domain (the monthly net-worth snapshot).
  const coreLoading = enabled ? !CORE_DOMAINS.every(settled) : false;
  // What a page waits for: only the core domains it declared.
  const loading = enabled ? needs.some((d) => CORE_DOMAINS.includes(d) && !settled(d)) : false;
  const snapshotsLoading = enabled ? !settled("snapshots") : false;

  const reloadLoans = useCallback(async () => {
    const { res, data } = await fetchJson<{ loans?: DashboardState["loans"] }>(
      "/api/loans",
      { credentials: "include" }
    );
    if (res.ok) {
      setLoans(data.loans ?? []);
      setDomainError("loans", null);
      setDomainStatus("loans", "ready");
      console.info("[useAppData] reloadLoans ok", { count: data.loans?.length ?? 0 });
    } else {
      setDomainError("loans", "Couldn't load instalment plans");
      setDomainStatus("loans", "error");
    }
  }, [setDomainError, setDomainStatus]);

  const reloadHoldings = useCallback(async () => {
    const { res, data } = await fetchJson<{ holdings?: DashboardState["holdings"] }>(
      "/api/holdings",
      { credentials: "include" }
    );
    if (res.ok) {
      setHoldings(data.holdings ?? []);
      setDomainError("holdings", null);
      setDomainStatus("holdings", "ready");
      console.info("[useAppData] reloadHoldings ok", {
        count: data.holdings?.length ?? 0,
      });
    } else {
      setDomainError("holdings", "Couldn't load holdings");
      setDomainStatus("holdings", "error");
    }
  }, [setDomainError, setDomainStatus]);

  const reloadOtherLoans = useCallback(async () => {
    const { res, data } = await fetchJson<{ otherLoans?: DashboardState["otherLoans"] }>(
      "/api/other-loans",
      { credentials: "include" }
    );
    if (res.ok) {
      setOtherLoans(data.otherLoans ?? []);
      setDomainError("otherLoans", null);
      setDomainStatus("otherLoans", "ready");
      console.info("[useAppData] reloadOtherLoans ok", {
        count: data.otherLoans?.length ?? 0,
      });
    } else {
      setDomainError("otherLoans", "Couldn't load personal and balance-transfer loans");
      setDomainStatus("otherLoans", "error");
    }
  }, [setDomainError, setDomainStatus]);

  // Dispatched by TabCards/CardPaymentModal (a statement payment can pay down
  // a linked BT loan) and OtherLoansPanel (direct edits) — nothing else keeps
  // the session-cached otherLoans in sync with those, so Debt and the net
  // worth liabilities breakdown would otherwise show stale balances until a
  // full reload.
  useDomainEvent(["otherLoans:changed"], () => {
    // Nothing to keep in sync if this session never asked for the loans.
    if (statusRef.current.otherLoans !== "idle") void reloadOtherLoans();
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
    assertDomainLoaded("loans");
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
  }, [assertDomainLoaded]);

  const saveBudgetMonth = useCallback(
    async (month: string, next: DashboardState["budget"]) => {
      if (!configured) {
        setBudgetMonths((prev) => ({ ...prev, [month]: next }));
        return;
      }
      // Saving replaces that month's lines: never from a budget that did not load.
      assertDomainLoaded("budget");
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
    [configured, assertDomainLoaded]
  );

  const saveCards = useCallback(async (next: DashboardState["creditCards"]) => {
    assertDomainLoaded("cards");
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
  }, [assertDomainLoaded]);

  const saveHoldings = useCallback(async (next: DashboardState["holdings"]) => {
    assertDomainLoaded("holdings");
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
  }, [assertDomainLoaded]);

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

  // One request in flight at a time; the newest snapshot always wins (see
  // createLatestWinsWriter). Without this, overlapping POSTs could land out of
  // order and leave an older figure stored for the month.
  const netWorthWriterRef = useRef<ReturnType<
    typeof createLatestWinsWriter<NetWorthSnapshot>
  > | null>(null);
  if (!netWorthWriterRef.current) {
    netWorthWriterRef.current = createLatestWinsWriter<NetWorthSnapshot>(async (snap) => {
      const { res, data } = await fetchJson<{ error?: string }>(
        "/api/net-worth/snapshots",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot: snap }),
        }
      );
      if (!res.ok) {
        throw new Error(data.error ?? "Couldn't save net worth snapshot");
      }
    });
  }

  /**
   * Upserts the current month's net worth. Unlike appendSnapshot (one write per
   * day, first write wins), this always posts on every call — the stored value
   * for a month should reflect the latest known state as of that visit, so it
   * keeps approximating "month end" more closely the closer to month-end you are.
   * Callers must only call this once every input has loaded successfully
   * (see lib/net-worth/snapshot-gate.ts). Rejects if the save failed; local
   * history is only updated after the server accepted the value.
   */
  const appendNetWorthSnapshot = useCallback(async (snap: NetWorthSnapshot) => {
    const persisted = await netWorthWriterRef.current!.write(snap);
    setNetWorthHistory((hist) => {
      const existingIdx = hist.findIndex((h) => h.month === persisted.month);
      if (existingIdx === -1) {
        return [...hist, persisted].slice(-NET_WORTH_HISTORY_LIMIT);
      }
      const existing = hist[existingIdx]!;
      if (existing.lnw === persisted.lnw && existing.cpf === persisted.cpf) {
        return hist;
      }
      const next = [...hist];
      next[existingIdx] = persisted;
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
    assertDomainLoaded("prefs"); // the PUT replaces all stored prefs
    const { res } = await fetchJson("/api/state", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { prefs: nextPrefs } }),
    });
    if (!res.ok) throw new Error("Failed to save preferences");
    setPrefs(nextPrefs);
  }, [assertDomainLoaded]);

  const saveProfilePolicies = useCallback(
    async (patch: {
      insurancePolicies?: DashboardState["insurancePolicies"];
      ilpPolicies?: DashboardState["ilpPolicies"];
    }) => {
      assertDomainLoaded("profile"); // replaces whole policy lists
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
    [assertDomainLoaded]
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

  // One stable value per real change: every consumer of AppDataContext re-renders whenever
  // this object's identity changes, so it must only change when one of its members does
  // (PERF-006). All members are state or useCallback results.
  return useMemo(
    () =>
      withLazyDomains(
        {
      state,
      setState,
      loading,
      coreLoading,
      domainStatus,
      ensureDomains,
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
        },
        CONTEXT_FIELD_DOMAIN,
        isRequested,
        requestFromRead
      ),
    [
      state,
      setState,
      loading,
      coreLoading,
      domainStatus,
      ensureDomains,
      isRequested,
      requestFromRead,
      snapshotsLoading,
      configured,
      loadErrors,
      load,
      reloadLoans,
      reloadOtherLoans,
      reloadHoldings,
      loadSnapshots,
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
      loadNetWorthHistory,
      appendNetWorthSnapshot,
      cpfContributions,
      loadCpfContributions,
      addCpfContribution,
      deleteCpfContribution,
      updateCpfContribution,
      cpfTransactions,
      loadCpfTransactions,
      addCpfTransaction,
      deleteCpfTransaction,
      updateCpfTransaction,
      creditCards,
    ]
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error("useAppData must be used within AppDataProvider");
  }
  return ctx;
}
