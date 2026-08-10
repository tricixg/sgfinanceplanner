"use client";

import { useCallback, useContext, useMemo, useState } from "react";
import type {
  DashboardState,
  Holding,
  HoldingMarket,
  IlpPolicy,
} from "@/lib/types";
import {
  computedIlpMonthly,
  defaultHolding,
  defaultIlpPolicy,
  holdingGain,
  holdingMarketValue,
  lockInLabel,
  lockInStatus,
  portfolioTotals,
  portfolioValue,
  ilpProfit,
  estimatedPremiumsPaid,
  wealthSummary,
} from "@/lib/finance";
import { fmt, fmt2, formatSnapshotDate } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";
import { DecimalInput } from "@/components/DecimalInput";
import { AppDataContext } from "@/contexts/app-data-contexts";
import { RecurringScheduleFields } from "@/components/recurring/RecurringScheduleFields";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import type { ChartOptions } from "chart.js";
import type { SavingsGoal, SavingsSnapshot, UserSavingsAccount } from "@/lib/savings/types";
import type { Fund, FundsTotals } from "@/lib/funds/types";
import { SavingsLedgerModal } from "@/components/savings/SavingsLedgerModal";
import { AddDividendModal } from "@/components/holdings/AddDividendModal";

const UUID_RE = /^[0-9a-f-]{36}$/i;

type FundsApi = {
  funds: Fund[];
  totals: FundsTotals | null;
  saveFunds: (next: Fund[]) => Promise<void>;
  recordFundTransaction: (
    fundId: string,
    payload: {
      amount: number;
      occurredAt?: string;
      kind?: "deposit" | "withdrawal" | "payout";
      note?: string;
      goalId?: string | null;
    }
  ) => Promise<void>;
};

type AccountsApi = {
  accounts: UserSavingsAccount[];
  recordAccountTransaction: (
    accountId: string,
    payload: {
      amount: number;
      occurredAt?: string;
      kind?: "deposit" | "withdrawal" | "adjustment";
      note?: string;
    }
  ) => Promise<void>;
};

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  savings?: SavingsSnapshot | null;
  snapshotsLoading?: boolean;
  fundsApi?: FundsApi;
  accountsApi?: AccountsApi;
  savingsGoals?: SavingsGoal[];
};

function priceStale(lastPriceAt?: string): boolean {
  if (!lastPriceAt) return true;
  const age = Date.now() - new Date(lastPriceAt).getTime();
  return age > 24 * 60 * 60 * 1000;
}

export function TabWealth({
  state: S,
  setState,
  savings,
  snapshotsLoading,
  fundsApi,
  accountsApi,
  savingsGoals = [],
}: Props) {
  const appData = useContext(AppDataContext);
  const [editingIlp, setEditingIlp] = useState(false);
  const [editingHoldings, setEditingHoldings] = useState(false);
  const [savingIlp, setSavingIlp] = useState(false);
  const [savingHoldings, setSavingHoldings] = useState(false);
  const [ilpDraft, setIlpDraft] = useState(S.ilpPolicies);
  const [holdingsDraft, setHoldingsDraft] = useState(S.holdings);
  const [marginDraft, setMarginDraft] = useState(S.margin);
  const [editingFunds, setEditingFunds] = useState(false);
  const [fundsDraft, setFundsDraft] = useState<Fund[]>([]);
  const [savingFunds, setSavingFunds] = useState(false);
  const [fundsMsg, setFundsMsg] = useState("");
  const [fundsTxRefresh, setFundsTxRefresh] = useState(0);
  const [ledgerFundId, setLedgerFundId] = useState<string | null>(null);
  const [dividendModalOpen, setDividendModalOpen] = useState(false);
  const [dividendInitialId, setDividendInitialId] = useState<string | null>(null);
  const [dividendsTxRefresh, setDividendsTxRefresh] = useState(0);

  const ilpPolicies = editingIlp ? ilpDraft : S.ilpPolicies;
  const displayHoldings = editingHoldings ? holdingsDraft : S.holdings;
  const wealthState = {
    ...S,
    ilpPolicies,
    holdings: displayHoldings,
    margin: editingHoldings ? marginDraft : S.margin,
  };

  const { port, invTotal, ilpVal, ilpLocked, fundsVal, personalCash } = wealthSummary(
    wealthState,
    savings
  );

  const ledgerFund =
    ledgerFundId && fundsApi
      ? fundsApi.funds.find((f) => f.id === ledgerFundId) ?? null
      : null;

  const startFundsEdit = () => {
    setFundsDraft(fundsApi?.funds ?? []);
    setEditingFunds(true);
    console.info("[TabWealth] funds edit on");
  };

  const saveFundsEdit = async () => {
    if (!fundsApi) return;
    setSavingFunds(true);
    setFundsMsg("");
    try {
      await fundsApi.saveFunds(fundsDraft);
      setEditingFunds(false);
      console.info("[TabWealth] funds saved");
    } catch (e) {
      setFundsMsg(e instanceof Error ? e.message : "Failed to save funds");
    } finally {
      setSavingFunds(false);
    }
  };

  const updateFund = (i: number, patch: Partial<Fund>) => {
    setFundsDraft((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  };

  const addFundRow = () => {
    setFundsDraft((prev) => [
      ...prev,
      {
        id: `new-${prev.length}`,
        userId: "",
        name: "",
        balance: 0,
        notes: "",
        sortOrder: prev.length,
        lifetimePayouts: 0,
      },
    ]);
  };

  const removeFundRow = (i: number) => {
    setFundsDraft((prev) => prev.filter((_, j) => j !== i));
  };
  const ilpPrem = computedIlpMonthly(wealthState);
  const totals = portfolioTotals(displayHoldings);

  const persistQuotes = useCallback(
    async (payload: {
      holdings: Holding[];
      moo: number;
      portfolioHistory: DashboardState["portfolioHistory"];
    }) => {
      if (!appData?.configured) return;
      await appData.saveHoldings(payload.holdings);
      await appData.saveProfile({ moo: payload.moo });
      const latest = payload.portfolioHistory[payload.portfolioHistory.length - 1];
      if (latest) await appData.appendSnapshot(latest);
      console.info("[TabWealth] persisted quote refresh");
    },
    [appData]
  );

  const { refresh, loading, error, lastRefresh } = useLiveQuotes(
    S.holdings,
    setState,
    persistQuotes
  );

  const holdings = useMemo(
    () =>
      [...displayHoldings].sort(
        (a, b) => holdingMarketValue(b) - holdingMarketValue(a)
      ),
    [displayHoldings]
  );

  const dividendEligibleHoldings = useMemo(
    () => holdings.filter((h) => h.id && UUID_RE.test(h.id)),
    [holdings]
  );

  const openDividendModal = (holdingId?: string | null) => {
    setDividendInitialId(holdingId ?? null);
    setDividendModalOpen(true);
  };

  const recordDividend = async (
    holdingId: string,
    payload: { perShare: number; qty: number; occurredAt: string; note?: string }
  ) => {
    if (!appData?.configured) return;
    await appData.recordHoldingDividend(holdingId, payload);
    setDividendsTxRefresh((k) => k + 1);
  };

  const deleteDividend = async (holdingId: string, dividendId: string) => {
    if (!appData?.configured) return;
    await appData.deleteHoldingDividend(holdingId, dividendId);
    setDividendsTxRefresh((k) => k + 1);
  };

  const realizedPnlTotal = useMemo(
    () => holdings.reduce((s, h) => s + (h.lifetimeDividends ?? 0), 0),
    [holdings]
  );

  const startIlpEdit = () => {
    setIlpDraft(structuredClone(S.ilpPolicies));
    setEditingIlp(true);
    console.info("[TabWealth] ILP edit on");
  };

  const saveIlp = async () => {
    setSavingIlp(true);
    try {
      if (appData?.configured) {
        await appData.saveProfilePolicies({ ilpPolicies: ilpDraft });
      } else {
        setState((prev) => ({ ...prev, ilpPolicies: ilpDraft }));
      }
      setEditingIlp(false);
      console.info("[TabWealth] ILP policies saved");
    } catch (e) {
      console.error("[TabWealth] ILP save failed", e);
    } finally {
      setSavingIlp(false);
    }
  };

  const updatePolicy = (i: number, patch: Partial<IlpPolicy>) => {
    setIlpDraft((prev) =>
      prev.map((p, j) => (j === i ? { ...p, ...patch } : p))
    );
    console.info("[TabWealth] updated ILP draft", i, patch);
  };

  const addPolicy = () => {
    setIlpDraft((prev) => [...prev, defaultIlpPolicy()]);
    console.info("[TabWealth] added ILP policy to draft");
  };

  const removePolicy = (i: number) => {
    setIlpDraft((prev) => prev.filter((_, j) => j !== i));
    console.info("[TabWealth] removed ILP policy from draft", i);
  };

  const startHoldingsEdit = () => {
    setHoldingsDraft(structuredClone(S.holdings));
    setMarginDraft(S.margin);
    setEditingHoldings(true);
    console.info("[TabWealth] holdings edit on");
  };

  const saveHoldingsEdit = async () => {
    setSavingHoldings(true);
    const moo = portfolioValue(holdingsDraft);
    try {
      if (appData?.configured) {
        await appData.saveHoldings(holdingsDraft);
        await appData.saveProfile({ margin: marginDraft, moo });
      } else {
        setState((prev) => ({
          ...prev,
          holdings: holdingsDraft,
          margin: marginDraft,
          moo,
        }));
      }
      setEditingHoldings(false);
      console.info("[TabWealth] holdings saved");
    } catch (e) {
      console.error("[TabWealth] holdings save failed", e);
    } finally {
      setSavingHoldings(false);
    }
  };

  const updateHolding = (i: number, patch: Partial<Holding>) => {
    setHoldingsDraft((prev) =>
      prev.map((h, j) => (j === i ? { ...h, ...patch } : h))
    );
    console.info("[TabWealth] updated holding draft", i, patch);
  };

  const addHolding = () => {
    setHoldingsDraft((prev) => [...prev, defaultHolding()]);
    console.info("[TabWealth] added holding to draft");
  };

  const removeHolding = (i: number) => {
    setHoldingsDraft((prev) => prev.filter((_, j) => j !== i));
    console.info("[TabWealth] removed holding from draft", i);
  };

  const patchMargin = (margin: number) => {
    setMarginDraft(margin);
    console.info("[TabWealth] updated margin draft", margin);
  };

  const allocationChart = useMemo(() => {
    const rows = holdings.filter((h) => holdingMarketValue(h) > 0);
    if (rows.length === 0) return null;
    return {
      labels: rows.map((h) => h.name || h.ticker),
      datasets: [
        {
          data: rows.map((h) => holdingMarketValue(h)),
          backgroundColor: [
            "#3d6b8e",
            "#2f5d3a",
            "#c08a2e",
            "#6b5a8e",
            "#b5482e",
            "#7a9eb5",
          ],
          borderWidth: 2,
          borderColor: "#faf7ef",
        },
      ],
    };
  }, [holdings]);

  const pnlChart = useMemo(() => {
    const rows = holdings.filter((h) => h.ticker && h.ticker !== "—");
    if (rows.length === 0) return null;
    return {
      labels: rows.map((h) => h.ticker),
      datasets: [
        {
          label: "Unrealized P&L",
          data: rows.map((h) => holdingGain(h).gain),
          backgroundColor: rows.map((h) =>
            holdingGain(h).gain >= 0 ? "rgba(47,93,58,.75)" : "rgba(181,72,46,.75)"
          ),
        },
      ],
    };
  }, [holdings]);

  const growthChart = useMemo(() => {
    const hist = S.portfolioHistory ?? [];
    if (hist.length < 2) return null;
    const sorted = [...hist].sort((a, b) =>
      a.recordedAt.localeCompare(b.recordedAt)
    );
    return {
      labels: sorted.map((s) => formatSnapshotDate(s.recordedAt)),
      datasets: [
        {
          label: "Market value",
          data: sorted.map((s) => s.totalValue),
          borderColor: "#3d6b8e",
          backgroundColor: "rgba(61,107,142,.12)",
          fill: true,
          tension: 0.25,
        },
        {
          label: "Cost basis",
          data: sorted.map((s) => s.totalCost),
          borderColor: "#a89a76",
          borderDash: [6, 4],
          tension: 0.25,
        },
      ],
    };
  }, [S.portfolioHistory]);

  const lineOpts: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true, position: "bottom" } },
    scales: {
      y: {
        ticks: {
          callback: (v) => "$" + (Number(v) / 1000).toFixed(1) + "k",
        },
      },
    },
  };

  const hBarOpts: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: {
          callback: (v) => "$" + Number(v).toLocaleString(),
        },
      },
    },
  };

  return (
    <section className="panel on">
      {savings && personalCash > 0 ? (
        <p className="ui-hint" style={{ marginBottom: 12 }}>
          Free cash uses your personal accounts (Cash Accounts tab). Joint pools stay on Savings
          &amp; Goals.
        </p>
      ) : null}
      <div className="callout tip">
        <span className="ico">Tip</span>
        Enter holdings with ticker, market (SGX/US), qty, and <b>avg cost</b>. Use{" "}
        <b>Refresh prices</b> loads live quotes from Yahoo (SGX <code>.SI</code>, US tickers).
        Update ILP <b>account value</b> when you get statements; estimated profit uses
        current value vs premiums paid. Net worth is on <b>This Month</b>.
      </div>

      <div className="grid g4">
        <div className="stat accent">
          <div className="lbl">Total investment assets</div>
          <div className="val">{fmt(invTotal)}</div>
          <div className="note">Holdings + ILP + Funds</div>
        </div>
        <div className="stat">
          <div className="lbl">ILP account value</div>
          <div className="val">{fmt(ilpVal)}</div>
          {ilpLocked > 0 && (
            <div className="note">{fmt(ilpLocked)} in lock-in (still in total)</div>
          )}
        </div>
        <div className="stat">
          <div className="lbl">Funds</div>
          <div className="val">{fmt(fundsVal)}</div>
          <div className="note">
            Lifetime payouts: {fmt(fundsApi?.totals?.fundsPnlTotal ?? 0)}
          </div>
        </div>
        <div className="stat warn">
          <div className="lbl">ILP premiums / mo</div>
          <div className="val">{fmt(ilpPrem)}</div>
          <div className="note">Shown on Budget tab (auto)</div>
        </div>
      </div>

      <div className="section-head">
        <h2>Funds</h2>
        {editingFunds ? (
          <button
            type="button"
            className="btn sm"
            disabled={savingFunds}
            onClick={() => void saveFundsEdit()}
          >
            {savingFunds ? "Saving…" : "Save"}
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startFundsEdit}>
            Edit
          </button>
        )}
      </div>
      <div className="callout tip" style={{ marginBottom: 12 }}>
        Money-market / cash-management funds — deposit and withdraw like an account, and log{" "}
        <b>payouts</b> (interest/dividends) as they land to track lifetime P&amp;L.
      </div>
      {fundsMsg ? <p className="pin-error">{fundsMsg}</p> : null}

      <div className="card">
        {!fundsApi ? (
          <p className="note">Sign in to add funds.</p>
        ) : editingFunds ? (
          <>
            {fundsDraft.length === 0 ? (
              <p className="note">Add money-market or cash-management funds.</p>
            ) : (
              fundsDraft.map((f, i) => (
                <div className="editrow accounts" key={f.id || i} style={{ marginBottom: 8 }}>
                  <input
                    type="text"
                    value={f.name}
                    placeholder="e.g. Endowus Cash Smart"
                    onChange={(e) => updateFund(i, { name: e.target.value })}
                  />
                  {/^[0-9a-f-]{36}$/i.test(f.id) ? (
                    <span className="note" title="Use deposits below to change balance">
                      {fmt2(f.balance)}
                    </span>
                  ) : (
                    <DecimalInput
                      value={f.balance}
                      step={0.01}
                      onChange={(v) => updateFund(i, { balance: v })}
                    />
                  )}
                  <input
                    type="text"
                    value={f.notes}
                    placeholder="Notes"
                    onChange={(e) => updateFund(i, { notes: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn del sm"
                    onClick={() => removeFundRow(i)}
                  >
                    del
                  </button>
                </div>
              ))
            )}
            <button type="button" className="btn ghost sm" onClick={addFundRow}>
              + Add fund
            </button>
          </>
        ) : fundsApi.funds.length === 0 ? (
          <p className="note">No funds yet. Click Edit to add one.</p>
        ) : (
          <div className="table-scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Fund</th>
                  <th className="num">Balance</th>
                  <th className="num">P&amp;L (payouts)</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {fundsApi.funds.map((f) => (
                  <tr
                    key={f.id}
                    className="ledger-row"
                    tabIndex={0}
                    role="button"
                    onClick={() => setLedgerFundId(f.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setLedgerFundId(f.id);
                      }
                    }}
                  >
                    <td>
                      <strong>{f.name || "—"}</strong>
                    </td>
                    <td className="num">{fmt2(f.balance)}</td>
                    <td className={`num ${f.lifetimePayouts >= 0 ? "gain-pos" : "gain-neg"}`}>
                      {f.lifetimePayouts >= 0 ? "+" : ""}
                      {fmt2(f.lifetimePayouts)}
                    </td>
                    <td className="note" style={{ fontSize: 12 }}>
                      {f.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ledgerFund ? (
        <SavingsLedgerModal
          target={{ variant: "fund", fund: ledgerFund }}
          txRefresh={fundsTxRefresh}
          fundPnl={fundsApi?.totals?.fundsPnlTotal}
          goalOptions={savingsGoals
            .filter((g) => g.scope === "individual")
            .map((g) => ({ id: g.id, name: g.name }))}
          fromAccountOptions={(accountsApi?.accounts ?? []).map((a) => ({
            id: a.id,
            name: a.name,
          }))}
          onClose={() => setLedgerFundId(null)}
          onRecord={async (payload) => {
            if (!fundsApi || payload.kind === "adjustment") return;
            if (payload.fromAccountId && accountsApi) {
              const fromName =
                accountsApi.accounts.find((a) => a.id === payload.fromAccountId)?.name ??
                "Account";
              await accountsApi.recordAccountTransaction(payload.fromAccountId, {
                amount: -payload.amount,
                kind: "adjustment",
                occurredAt: payload.occurredAt,
                note: `Transfer to ${ledgerFund.name || "Fund"}`,
              });
              await fundsApi.recordFundTransaction(ledgerFund.id, {
                ...payload,
                kind: payload.kind,
                note: payload.note || `Transfer from ${fromName}`,
              });
            } else {
              await fundsApi.recordFundTransaction(ledgerFund.id, {
                ...payload,
                kind: payload.kind,
              });
            }
            setFundsTxRefresh((k) => k + 1);
          }}
        />
      ) : null}

      <div className="section-head">
        <h2>Investment-linked policies (ILP)</h2>
        {editingIlp ? (
          <button
            type="button"
            className="btn sm"
            disabled={savingIlp}
            onClick={() => void saveIlp()}
          >
            {savingIlp ? "Saving…" : "Save"}
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startIlpEdit}>
            Edit
          </button>
        )}
      </div>

      <div className="callout tip" style={{ marginBottom: 12 }}>
        Singapore ILPs combine insurance and unit-linked funds. Update <b>account value</b> in
        Edit when you get statements; <b>Est. profit vs premiums</b> uses current value vs net
        premiums paid (minus start bonus).
        MAS guide:{" "}
        <a
          href="https://www.moneysense.gov.sg/investment-linked-policies-guide-to-fees-and-pricing/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--moss)" }}
        >
          MoneySense — ILP fees
        </a>
        .
      </div>

      {editingIlp ? (
        <div className="card">
          {ilpPolicies.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic", marginBottom: 12 }}>
              No ILP policies yet.
            </p>
          ) : (
            ilpPolicies.map((p, i) => (
              <div key={i} className="ilp-edit-card">
                <div className="ilp-edit-grid">
                  <label>
                    Insurer
                    <input
                      type="text"
                      value={p.insurer}
                      onChange={(e) => updatePolicy(i, { insurer: e.target.value })}
                    />
                  </label>
                  <label>
                    Plan name
                    <input
                      type="text"
                      value={p.planName}
                      onChange={(e) => updatePolicy(i, { planName: e.target.value })}
                    />
                  </label>
                  <label>
                    Policy no.
                    <input
                      type="text"
                      value={p.policyNo}
                      onChange={(e) => updatePolicy(i, { policyNo: e.target.value })}
                    />
                  </label>
                  <label>
                    Premium type
                    <select
                      value={p.premiumType}
                      onChange={(e) =>
                        updatePolicy(i, {
                          premiumType: e.target.value as IlpPolicy["premiumType"],
                        })
                      }
                    >
                      <option value="regular">Regular premium</option>
                      <option value="single">Single premium</option>
                    </select>
                  </label>
                  <label>
                    Loading structure
                    <select
                      value={p.loadingType}
                      onChange={(e) =>
                        updatePolicy(i, {
                          loadingType: e.target.value as IlpPolicy["loadingType"],
                        })
                      }
                    >
                      <option value="front-end">Front-end loaded</option>
                      <option value="back-end">Back-end loaded</option>
                      <option value="single">Single premium (100% units)</option>
                    </select>
                  </label>
                  <label>
                    Monthly premium
                    <DecimalInput
                      value={p.monthlyPremium}
                      step={0.01}
                      onChange={(v) => updatePolicy(i, { monthlyPremium: v })}
                    />
                  </label>
                  <RecurringScheduleFields
                    deductionDay={p.deductionDay}
                    defaultFinancialAccountId={p.defaultFinancialAccountId}
                    onDeductionDayChange={(day) => updatePolicy(i, { deductionDay: day })}
                    onAccountChange={(id) =>
                      updatePolicy(i, { defaultFinancialAccountId: id })
                    }
                  />
                  <label>
                    Account value
                    <DecimalInput
                      value={p.accountValue}
                      step={0.01}
                      onChange={(v) => updatePolicy(i, { accountValue: v })}
                    />
                  </label>
                  <label>
                    Start bonus (SGD)
                    <DecimalInput
                      value={p.initialBonus}
                      step={0.01}
                      onChange={(v) => updatePolicy(i, { initialBonus: v })}
                    />
                    <span className="note" style={{ display: "block", marginTop: 4 }}>
                      Welcome / allocation bonus at policy start
                    </span>
                  </label>
                  <label>
                    Allocation rate (% to units)
                    <DecimalInput
                      value={p.premiumAllocationPct}
                      step={1}
                      onChange={(v) => updatePolicy(i, { premiumAllocationPct: v })}
                    />
                  </label>
                  <label>
                    Policy start (YYYY-MM)
                    <input
                      type="month"
                      value={p.policyStartYm}
                      onChange={(e) => updatePolicy(i, { policyStartYm: e.target.value })}
                    />
                  </label>
                  <label>
                    Lock-in / min. period ends
                    <input
                      type="month"
                      value={p.lockInEndYm}
                      onChange={(e) => updatePolicy(i, { lockInEndYm: e.target.value })}
                    />
                  </label>
                  <label>
                    Surrender charge ends
                    <input
                      type="month"
                      value={p.surrenderChargeEndYm}
                      onChange={(e) =>
                        updatePolicy(i, { surrenderChargeEndYm: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Insurance cover (sum assured)
                    <DecimalInput
                      value={p.insuranceCover}
                      step={1000}
                      onChange={(v) => updatePolicy(i, { insuranceCover: v })}
                    />
                  </label>
                  <label>
                    Free fund switches / yr
                    <DecimalInput
                      value={p.freeFundSwitchesPerYear}
                      step={1}
                      onChange={(v) => updatePolicy(i, { freeFundSwitchesPerYear: v })}
                    />
                  </label>
                  <label className="full">
                    Sub-funds held
                    <input
                      type="text"
                      value={p.funds}
                      placeholder="e.g. Equity, Balanced, Bond"
                      onChange={(e) => updatePolicy(i, { funds: e.target.value })}
                    />
                  </label>
                  <label className="full">
                    Notes
                    <input
                      type="text"
                      value={p.notes}
                      onChange={(e) => updatePolicy(i, { notes: e.target.value })}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn del sm"
                  onClick={() => removePolicy(i)}
                >
                  Remove policy
                </button>
              </div>
            ))
          )}
          <div className="toolbar">
            <button type="button" className="btn ghost sm" onClick={addPolicy}>
              + Add ILP policy
            </button>
          </div>
        </div>
      ) : (
        <div className="card table-scroll">
          {S.ilpPolicies.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
              No ILP policies. Click Edit to add your Manulife or other ILP details.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Insurer</th>
                  <th>Plan</th>
                  <th>Premium / mo</th>
                  <th>Premiums paid to date</th>
                  <th>Account value</th>
                  <th>Start bonus</th>
                  <th>Est. profit vs premiums</th>
                  <th>Loading</th>
                  <th>Lock-in</th>
                </tr>
              </thead>
              <tbody>
                {S.ilpPolicies.map((p, i) => {
                  const lock = lockInStatus(p);
                  const profit = ilpProfit(p);
                  const premiumsPaid = estimatedPremiumsPaid(p);
                  return (
                    <tr key={i}>
                      <td>{p.insurer || "—"}</td>
                      <td>{p.planName || "—"}</td>
                      <td className="num">{fmt2(p.monthlyPremium)}</td>
                      <td className="num">{fmt2(premiumsPaid)}</td>
                      <td className="num">{fmt2(p.accountValue)}</td>
                      <td className="num">
                        {p.initialBonus > 0 ? fmt2(p.initialBonus) : "—"}
                      </td>
                      <td className={`num ${profit >= 0 ? "gain-pos" : "gain-neg"}`}>
                        {profit >= 0 ? "+" : ""}
                        {fmt2(profit)}
                      </td>
                      <td>{p.loadingType}</td>
                      <td>
                        <span
                          className={`tag ${lock === "locked" ? "t-soon" : lock === "free" ? "t-live" : "t-end"}`}
                        >
                          {lockInLabel(p)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="section-head">
        <h2>Investment holdings</h2>
        {!editingHoldings && dividendEligibleHoldings.length > 0 && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => openDividendModal(dividendEligibleHoldings[0].id)}
          >
            + Add dividend
          </button>
        )}
        {editingHoldings ? (
          <button
            type="button"
            className="btn sm"
            disabled={savingHoldings}
            onClick={() => void saveHoldingsEdit()}
          >
            {savingHoldings ? "Saving…" : "Save"}
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startHoldingsEdit}>
            Edit
          </button>
        )}
      </div>

      <div className="card">
        {!editingHoldings && holdings.length > 0 && (
          <div className="quotes-toolbar">
            <button
              type="button"
              className="btn sm"
              disabled={loading}
              onClick={() => void refresh()}
            >
              {loading ? "Refreshing…" : "Refresh prices"}
            </button>
            {lastRefresh?.status === "success" && (
              <>
                <span className="quotes-meta">
                  Last refresh {new Date(lastRefresh.at).toLocaleString("en-SG")}
                </span>
                {error && (
                  <span className="quotes-meta" style={{ color: "var(--muted)" }}>
                    {error}
                  </span>
                )}
              </>
            )}
            {lastRefresh?.status === "failed" && (
              <>
                <span className="quotes-meta" style={{ color: "var(--rust)" }}>
                  Last refresh failed
                  {lastRefresh.reason === "no_symbols" ? " — no tickers" : ""}{" "}
                  ({new Date(lastRefresh.at).toLocaleString("en-SG")})
                </span>
                {error && (
                  <span className="quotes-meta" style={{ color: "var(--muted)" }}>
                    {error}
                  </span>
                )}
              </>
            )}
            {error && !lastRefresh && (
              <span className="quotes-meta" style={{ color: "var(--rust)" }}>
                {error}
              </span>
            )}
          </div>
        )}

        {editingHoldings ? (
          <>
            <div
              className="editrow"
              style={{ borderBottom: "1.5px solid var(--ink)", paddingBottom: 10 }}
            >
              <span>Margin loan (outstanding)</span>
              <DecimalInput value={marginDraft} onChange={patchMargin} />
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="editrow head holdings">
              <span>Stock</span>
              <span>Ticker</span>
              <span>Mkt</span>
              <span>Qty</span>
              <span>Avg cost</span>
              <span>Last $</span>
              <span>Sector</span>
              <span></span>
            </div>
            {holdingsDraft.length === 0 ? (
              <p style={{ color: "var(--muted)", fontStyle: "italic", margin: "12px 0" }}>
                No holdings yet. Add a line below.
              </p>
            ) : (
              holdingsDraft.map((h, i) => (
                <div className="editrow holdings" key={i}>
                  <input
                    type="text"
                    value={h.name}
                    onChange={(e) => updateHolding(i, { name: e.target.value })}
                  />
                  <input
                    type="text"
                    value={h.ticker}
                    onChange={(e) => updateHolding(i, { ticker: e.target.value })}
                  />
                  <select
                    value={h.market}
                    onChange={(e) =>
                      updateHolding(i, { market: e.target.value as HoldingMarket })
                    }
                  >
                    <option value="SGX">SGX</option>
                    <option value="US">US</option>
                  </select>
                  <DecimalInput
                    value={h.qty}
                    step={1}
                    onChange={(v) => updateHolding(i, { qty: v })}
                  />
                  <DecimalInput
                    value={h.avgCost}
                    step={0.001}
                    onChange={(v) => updateHolding(i, { avgCost: v })}
                  />
                  <DecimalInput
                    value={h.lastPrice}
                    step={0.001}
                    onChange={(v) =>
                      updateHolding(i, {
                        lastPrice: v,
                        lastPriceAt: new Date().toISOString(),
                      })
                    }
                  />
                  <input
                    type="text"
                    value={h.sector}
                    onChange={(e) => updateHolding(i, { sector: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn del sm"
                    onClick={() => removeHolding(i)}
                  >
                    del
                  </button>
                </div>
              ))
            )}
            <div className="toolbar">
              <button type="button" className="btn ghost sm" onClick={addHolding}>
                + Add holding
              </button>
            </div>
          </>
        ) : holdings.length === 0 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            No stock holdings. Click <b>Edit</b> to add lines.
          </p>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Stock</th>
                    <th>Ticker</th>
                    <th>Mkt</th>
                    <th>Qty</th>
                    <th>Last</th>
                    <th>Avg cost</th>
                    <th>Value</th>
                    <th>Gain</th>
                    <th>%</th>
                    <th>Wt</th>
                    <th className="num">Realized P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h, i) => {
                    const g = holdingGain(h);
                    const w = port > 0 ? (g.marketValue / port) * 100 : 0;
                    const stale = priceStale(h.lastPriceAt);
                    const dividends = h.lifetimeDividends ?? 0;
                    return (
                      <tr key={`${h.ticker}-${i}`}>
                        <td>{h.name}</td>
                        <td className="num">
                          {h.ticker}
                          {stale && (
                            <span
                              className="tag t-soon"
                              style={{ marginLeft: 6, fontSize: 8 }}
                            >
                              stale
                            </span>
                          )}
                        </td>
                        <td>{h.market}</td>
                        <td className="num">{h.qty.toLocaleString()}</td>
                        <td className="num">{h.lastPrice.toFixed(3)}</td>
                        <td className="num">{h.avgCost.toFixed(3)}</td>
                        <td className="num">{fmt2(g.marketValue)}</td>
                        <td className={`num ${g.gain >= 0 ? "gain-pos" : "gain-neg"}`}>
                          {g.gain >= 0 ? "+" : ""}
                          {fmt2(g.gain)}
                        </td>
                        <td className={`num ${g.gain >= 0 ? "gain-pos" : "gain-neg"}`}>
                          {g.gainPct.toFixed(1)}%
                        </td>
                        <td className={`num ${w > 50 ? "neg" : ""}`}>{w.toFixed(1)}%</td>
                        <td className={`num ${dividends >= 0 ? "gain-pos" : "gain-neg"}`}>
                          {dividends >= 0 ? "+" : ""}
                          {fmt2(dividends)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {(allocationChart ||
              pnlChart ||
              growthChart ||
              (snapshotsLoading && (S.portfolioHistory?.length ?? 0) < 2)) && (
              <div className="holdings-charts">
                {allocationChart && (
                  <div className="card" style={{ margin: 0 }}>
                    <div className="section-lbl">Allocation</div>
                    <ChartBox
                      type="doughnut"
                      height={240}
                      data={allocationChart}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: "bottom" } },
                      }}
                    />
                  </div>
                )}
                {pnlChart && (
                  <div className="card" style={{ margin: 0 }}>
                    <div className="section-lbl">P&amp;L by holding</div>
                    <ChartBox type="bar" height={240} data={pnlChart} options={hBarOpts} />
                  </div>
                )}
                {snapshotsLoading && (S.portfolioHistory?.length ?? 0) < 2 ? (
                  <div className="card holdings-charts-full" style={{ margin: 0 }}>
                    <div className="section-lbl">Portfolio growth (on refresh)</div>
                    <p className="note loading">Loading portfolio history…</p>
                  </div>
                ) : growthChart ? (
                  <div className="card holdings-charts-full" style={{ margin: 0 }}>
                    <div className="section-lbl">Portfolio growth (on refresh)</div>
                    <ChartBox type="line" tall data={growthChart} options={lineOpts} />
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}

        <div className="grid g4 holdings-summary">
          <div className="stat accent">
            <div className="lbl">Portfolio value</div>
            <div className="val">{fmt(totals.totalValue)}</div>
            <div className="note">Qty × last price</div>
          </div>
          <div className="stat">
            <div className="lbl">Unrealized gain</div>
            <div className={`val ${totals.totalGain >= 0 ? "gain-pos" : "gain-neg"}`}>
              {totals.totalGain >= 0 ? "+" : ""}
              {fmt(totals.totalGain)}
            </div>
            <div className="note">
              {totals.totalGainPct.toFixed(1)}% on {fmt(totals.totalCost)} cost
            </div>
          </div>
          <div className="stat">
            <div className="lbl">Realized P&amp;L (dividends)</div>
            <div className={`val ${realizedPnlTotal >= 0 ? "gain-pos" : "gain-neg"}`}>
              {realizedPnlTotal >= 0 ? "+" : ""}
              {fmt(realizedPnlTotal)}
            </div>
            <div className="note">Lifetime dividend payouts</div>
          </div>
          <div className="stat warn">
            <div className="lbl">Margin loan</div>
            <div className="val">{fmt(S.margin)}</div>
            <div className="note">
              {editingHoldings ? "Edit in the row above" : "Click Edit to change"}
            </div>
          </div>
        </div>

        {dividendModalOpen && dividendEligibleHoldings.length > 0 ? (
          <AddDividendModal
            holdings={dividendEligibleHoldings}
            initialHoldingId={dividendInitialId}
            txRefresh={dividendsTxRefresh}
            onClose={() => setDividendModalOpen(false)}
            onRecord={recordDividend}
            onDelete={deleteDividend}
          />
        ) : null}
      </div>
    </section>
  );
}
