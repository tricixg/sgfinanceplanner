"use client";

import { useEffect, useMemo, useState } from "react";
import type { CreditCard, DashboardState } from "@/lib/types";
import type { OtherLoan } from "@/lib/other-loans/types";
import {
  aggregateOpenCycles,
  openCycleDisplayTotal,
} from "@/lib/cards/open-cycle-display";
import type { CardStatementComputed } from "@/lib/cards/types";
import {
  BANKS,
  CATALOG_AS_OF,
  CARDS_BY_BANK,
  getCatalogEntry,
  SPEND_CATEGORY_LABELS,
  type SpendCategory,
} from "@/lib/cards/sg-card-catalog";
import {
  applyCatalogEntry,
  countCardsByRewardType,
  recommendCardForSpend,
  type CardRecommendation,
  type RewardPreference,
} from "@/lib/finance/card-rewards";
import { ensureCreditCardIds } from "@/lib/finance/card-linking";
import { fmt2 } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";
import { Snackbar } from "@/components/Snackbar";
import { useCardStatements } from "@/hooks/useCardStatements";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { useSnackbar } from "@/hooks/useSnackbar";
import { DecimalInput, DecimalTextInput } from "@/components/DecimalInput";

type CardsApi = {
  cards: CreditCard[];
  saveCards: (next: CreditCard[]) => Promise<void>;
  configured: boolean;
};

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  cardsApi?: CardsApi;
};

const SPEND_CATEGORIES = Object.keys(SPEND_CATEGORY_LABELS) as SpendCategory[];

function rewardTagClass(type?: CreditCard["rewardType"]): string {
  if (type === "miles") return "tag t-live";
  if (type === "cashback") return "tag t-soon";
  if (type === "hybrid") return "tag t-end";
  return "tag";
}

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function CardPaymentModal({
  statement,
  onClose,
  onPaid,
}: {
  statement: CardStatementComputed;
  onClose: () => void;
  onPaid: () => Promise<void>;
}) {
  const { accounts } = useFinancialAccounts();
  const cashAccounts = accounts.filter((a) => a.accountType === "cash");
  const defaultPay =
    statement.minimumDue != null && statement.minimumDue > 0
      ? statement.minimumDue
      : statement.outstandingBalance;
  const [amount, setAmount] = useState(String(defaultPay));
  const [financialAccountId, setFinancialAccountId] = useState(
    cashAccounts[0]?.id ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setMsg("Enter a valid amount");
      return;
    }
    if (!financialAccountId) {
      setMsg("Select a cash account");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/credit-cards/statements/${statement.id}/pay`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amt, financialAccountId }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Payment failed");
      console.info("[TabCards] payment ok", { statementId: statement.id, amt });
      await onPaid();
      onClose();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Payment failed");
      console.error("[TabCards] payment failed", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="card modal-panel">
        <h3>Record card payment</h3>
        <p className="note">
          {statement.cardName} · statement {fmtDate(statement.statementCloseDate)} ·
          outstanding {fmt2(statement.outstandingBalance)}
        </p>
        <form onSubmit={(e) => void submit(e)}>
          <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0 }}>
          <label>
            Amount (SGD)
            <DecimalTextInput
              value={amount}
              onChange={setAmount}
              required
              disabled={saving}
            />
          </label>
          <label>
            Pay from (cash)
            <select
              value={financialAccountId}
              onChange={(e) => setFinancialAccountId(e.target.value)}
              required
              disabled={saving}
            >
              <option value="">— Select —</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          </fieldset>
          {msg && <p className="note" style={{ color: "var(--rust)" }}>{msg}</p>}
          <div className="toolbar">
            <button type="button" className="btn ghost sm" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn sm" disabled={saving}>
              {saving ? "Saving…" : "Record payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TabCards({ state: S, setState, cardsApi }: Props) {
  const creditCards = cardsApi?.configured ? cardsApi.cards : S.creditCards;
  const statementsEnabled = Boolean(cardsApi?.configured);
  const {
    bundle,
    loading: statementsLoading,
    reload: reloadStatements,
  } = useCardStatements(statementsEnabled);
  const { accounts: financialAccounts } = useFinancialAccounts();

  const snackbar = useSnackbar();
  const [initialLoadDone, setInitialLoadDone] = useState(!statementsEnabled);

  useEffect(() => {
    if (!statementsEnabled) {
      setInitialLoadDone(true);
      return;
    }
    if (!statementsLoading) {
      setInitialLoadDone(true);
    }
  }, [statementsEnabled, statementsLoading]);

  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<CreditCard[] | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [spendAmount, setSpendAmount] = useState(500);
  const [spendCategory, setSpendCategory] = useState<SpendCategory>("dining");
  const [preference, setPreference] = useState<RewardPreference>("best");
  const [recommendation, setRecommendation] = useState<CardRecommendation | null>(
    null
  );
  const [payStatement, setPayStatement] = useState<CardStatementComputed | null>(null);
  const [draftActual, setDraftActual] = useState<Record<string, string>>({});
  const [draftMinDue, setDraftMinDue] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [showOpenCycleDetail, setShowOpenCycleDetail] = useState(false);
  const [excludeCarriedFromOpenCycle, setExcludeCarriedFromOpenCycle] =
    useState(false);

  const openCycleAgg = useMemo(
    () =>
      aggregateOpenCycles(bundle.openCycles, excludeCarriedFromOpenCycle),
    [bundle.openCycles, excludeCarriedFromOpenCycle]
  );

  const rewardCounts = useMemo(
    () => countCardsByRewardType(creditCards),
    [creditCards]
  );

  const statementByCardKey = useMemo(() => {
    const map = new Map<string, CardStatementComputed>();
    for (const s of bundle.statements) {
      map.set(s.creditCardKey, s);
    }
    return map;
  }, [bundle.statements]);

  const patchEditDraft = (updater: (prev: CreditCard[]) => CreditCard[]) => {
    setEditDraft((prev) => ensureCreditCardIds(updater(prev ?? creditCards)));
  };

  const updateCard = (i: number, patch: Partial<CreditCard>) => {
    patchEditDraft((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    console.log("[TabCards] updated card draft", i, patch);
  };

  const applyCatalog = (i: number, catalogId: string) => {
    if (!catalogId) {
      updateCard(i, {
        catalogId: undefined,
        bank: undefined,
        rewardType: undefined,
        rewardHeadline: undefined,
        rewardRules: undefined,
      });
      return;
    }
    const entry = getCatalogEntry(catalogId);
    if (!entry) return;
    patchEditDraft((prev) =>
      prev.map((c, j) =>
        j === i
          ? {
              ...c,
              ...applyCatalogEntry(entry),
              statementDay: c.statementDay,
              paymentDueDay: c.paymentDueDay,
              interestRateApr: c.interestRateApr,
            }
          : c
      )
    );
    console.log("[TabCards] applied catalog", catalogId);
  };

  const addCard = () => {
    patchEditDraft((prev) => [
      ...prev,
      {
        name: "New card",
        statementDay: 1,
        paymentDueDay: 21,
        statementAmount: 0,
        interestRateApr: 0,
      },
    ]);
    console.log("[TabCards] added card to draft");
  };

  const removeCard = (i: number) => {
    patchEditDraft((prev) => prev.filter((_, j) => j !== i));
    console.log("[TabCards] removed card from draft", i);
  };

  const cardsInEdit = editDraft ?? creditCards;

  useEffect(() => {
    setDraftActual((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const s of bundle.statements) {
        if (next[s.id] === undefined && s.actualAmount != null) {
          next[s.id] = String(s.actualAmount);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setDraftMinDue((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const s of bundle.statements) {
        if (next[s.id] === undefined && s.minimumDue != null) {
          next[s.id] = String(s.minimumDue);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [bundle.statements]);

  const saveStatementRow = async (stmt: CardStatementComputed) => {
    const actualRaw = draftActual[stmt.id] ?? "";
    const minRaw = draftMinDue[stmt.id] ?? "";
    const actualAmount = actualRaw === "" ? undefined : parseFloat(actualRaw);
    const minimumDue =
      minRaw === "" ? null : parseFloat(minRaw);

    if (actualAmount !== undefined && (!Number.isFinite(actualAmount) || actualAmount < 0)) {
      return;
    }
    if (
      minimumDue != null &&
      (!Number.isFinite(minimumDue) || minimumDue < 0)
    ) {
      return;
    }
    if (actualAmount === undefined && minRaw === "") return;

    setSavingRow(stmt.id);
    try {
      const body: { actualAmount?: number; minimumDue?: number | null } = {};
      if (actualAmount !== undefined) body.actualAmount = actualAmount;
      if (minRaw !== "" || stmt.minimumDue != null) body.minimumDue = minimumDue;

      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/credit-cards/statements/${stmt.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      console.info("[TabCards] saved statement row", { id: stmt.id, body });
      await reloadStatements({ silent: true });
      snackbar.show("Statement saved");
    } catch (e) {
      console.error("[TabCards] save statement row failed", e);
      snackbar.show(
        e instanceof Error ? e.message : "Failed to save statement",
        { error: true }
      );
    } finally {
      setSavingRow(null);
    }
  };

  const runAdvisor = () => {
    const rec = recommendCardForSpend(
      creditCards,
      spendAmount,
      spendCategory,
      preference
    );
    setRecommendation(rec);
    console.log("[TabCards] recommend", { spendAmount, spendCategory, preference, rec });
  };

  const startEditing = () => {
    setEditDraft(ensureCreditCardIds([...creditCards]));
    setEditing(true);
    console.log("[TabCards] edit mode on");
  };

  const finishEditing = async () => {
    if (!editDraft) {
      setEditing(false);
      return;
    }
    setSavingConfig(true);
    try {
      const next = ensureCreditCardIds(editDraft);
      if (cardsApi?.configured) {
        await cardsApi.saveCards(next);
      } else {
        setState((prev) => ({ ...prev, creditCards: next }));
      }
      if (statementsEnabled) {
        await reloadStatements({ silent: true });
      }
      snackbar.show("Card configuration saved");
      setEditing(false);
      setEditDraft(null);
      console.log("[TabCards] edit mode off, saved");
    } catch (e) {
      console.error("[TabCards] save config failed", e);
      snackbar.show(
        e instanceof Error ? e.message : "Failed to save cards",
        { error: true }
      );
    } finally {
      setSavingConfig(false);
    }
  };

  if (statementsEnabled && !initialLoadDone) {
    return (
      <section className="panel on">
        <p className="loading">Loading credit cards and statements…</p>
      </section>
    );
  }

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Pick cards from the Singapore catalog (indicative as of {CATALOG_AS_OF}).
        Enter statement amount and minimum due for each card, then record payment from a
        cash account. Unpaid balances after the due date carry forward with daily interest.
      </div>

      <div className="grid g2" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="lbl">Cards tracked</div>
          <div className="val">{creditCards.length}</div>
          <div className="note">
            {rewardCounts.miles} miles · {rewardCounts.cashback} cashback
            {rewardCounts.hybrid > 0 ? ` · ${rewardCounts.hybrid} hybrid` : ""}
          </div>
        </div>
        {statementsEnabled && bundle.openCycles.length > 0 && (
          <div className="stat accent">
            <div className="lbl">Est. next statements (all cards)</div>
            <div className="val">{fmt2(openCycleAgg.displayTotal)}</div>
            <div className="note">
              {excludeCarriedFromOpenCycle
                ? "New spend + interest only"
                : "Includes carried forward"}
              <br />
              <button
                type="button"
                className="btn ghost sm"
                style={{ marginTop: 4 }}
                onClick={() => setShowOpenCycleDetail((v) => !v)}
              >
                {showOpenCycleDetail ? "Hide" : "View"} open-cycle estimates
              </button>
            </div>
          </div>
        )}
      </div>

      {statementsEnabled && showOpenCycleDetail && bundle.openCycles.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div
            className="section-head"
            style={{ marginBottom: 12, alignItems: "center" }}
          >
            <h3 style={{ margin: 0 }}>Open-cycle estimates</h3>
            <label className="open-cycle-toggle">
              <input
                type="checkbox"
                checked={excludeCarriedFromOpenCycle}
                onChange={(e) => {
                  setExcludeCarriedFromOpenCycle(e.target.checked);
                  console.info("[TabCards] open cycle exclude carried", {
                    exclude: e.target.checked,
                  });
                }}
              />
              Exclude carried
            </label>
          </div>
          <div className="grid g3 card-open-cycle-grid">
            <div className="stat accent">
              <div className="lbl">All cards</div>
              <div className="val">{fmt2(openCycleAgg.displayTotal)}</div>
              <div className="note">
                {openCycleAgg.cardCount} cards · {openCycleAgg.minDaysLeft}d min left
                <br />
                Spend {fmt2(openCycleAgg.newSpend)}
                {!excludeCarriedFromOpenCycle && openCycleAgg.carriedForward > 0
                  ? ` · Carried ${fmt2(openCycleAgg.carriedForward)}`
                  : ""}
                {excludeCarriedFromOpenCycle && openCycleAgg.carriedForward > 0
                  ? ` · Carried ${fmt2(openCycleAgg.carriedForward)} (excluded)`
                  : ""}
              </div>
            </div>
            {bundle.openCycles.map((o) => {
              const displayTotal = openCycleDisplayTotal(
                o,
                excludeCarriedFromOpenCycle
              );
              return (
                <div className="stat" key={o.creditCardId}>
                  <div className="lbl">{o.cardName}</div>
                  <div className="val">{fmt2(displayTotal)}</div>
                  <div className="note">
                    Stmt {fmtDate(o.statementCloseDate)} · {o.daysLeftInCycle}d left
                    <br />
                    Spend {fmt2(o.newSpend)}
                    {o.carriedForward > 0
                      ? excludeCarriedFromOpenCycle
                        ? ` · Carried ${fmt2(o.carriedForward)} (excluded)`
                        : ` · Carried ${fmt2(o.carriedForward)}`
                      : ""}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="table-scroll" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Next statement</th>
                  <th>Carried</th>
                  <th>New spend</th>
                  <th>Interest</th>
                  <th>Est. total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <b>All cards</b>
                  </td>
                  <td>
                    <div className="note">{openCycleAgg.cardCount} cards</div>
                  </td>
                  <td className="num">{fmt2(openCycleAgg.carriedForward)}</td>
                  <td className="num">{fmt2(openCycleAgg.newSpend)}</td>
                  <td className="num">{fmt2(openCycleAgg.interestEstimate)}</td>
                  <td className="num">
                    <b>{fmt2(openCycleAgg.estimatedTotal)}</b>
                  </td>
                </tr>
                {bundle.openCycles.map((o) => (
                  <tr key={o.creditCardId}>
                    <td>{o.cardName}</td>
                    <td>
                      {fmtDate(o.statementCloseDate)}
                      <div className="note">{o.daysLeftInCycle} days left</div>
                    </td>
                    <td className="num">{fmt2(o.carriedForward)}</td>
                    <td className="num">{fmt2(o.newSpend)}</td>
                    <td className="num">{fmt2(o.interestEstimate)}</td>
                    <td className="num">
                      <b>{fmt2(o.estimatedTotal)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="section-head">
        <h2>Card configuration</h2>
        {editing ? (
          <button
            type="button"
            className="btn sm"
            disabled={savingConfig}
            onClick={() => void finishEditing()}
          >
            {savingConfig ? "Saving…" : "Done"}
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            disabled={savingRow !== null}
            onClick={startEditing}
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="card">
          <fieldset disabled={savingConfig} style={{ border: 0, margin: 0, padding: 0 }}>
          {cardsInEdit.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic", marginBottom: 12 }}>
              No cards yet. Add one below.
            </p>
          ) : (
            cardsInEdit.map((c, i) => (
              <div key={i} className="card-edit-block">
                <div className="catalog-select-row">
                  <label>
                    Bank
                    <select
                      value={c.bank ?? ""}
                      onChange={(e) => {
                        const bank = e.target.value;
                        updateCard(i, { bank: bank || undefined });
                        if (bank && c.catalogId) {
                          const stillValid = CARDS_BY_BANK[bank]?.some(
                            (x) => x.id === c.catalogId
                          );
                          if (!stillValid) applyCatalog(i, "");
                        }
                      }}
                    >
                      <option value="">— Bank —</option>
                      {BANKS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Card product
                    <select
                      value={c.catalogId ?? ""}
                      onChange={(e) => applyCatalog(i, e.target.value)}
                    >
                      <option value="">Custom / not in list</option>
                      {(c.bank ? CARDS_BY_BANK[c.bank] ?? [] : []).map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="editrow cards-edit">
                  <input
                    type="text"
                    value={c.name}
                    placeholder="Display name"
                    onChange={(e) => updateCard(i, { name: e.target.value })}
                  />
                  <label className="note" style={{ display: "flex", flexDirection: "column" }}>
                    Stmt day
                    <DecimalInput
                      value={c.statementDay}
                      min={1}
                      max={31}
                      onChange={(v) =>
                        updateCard(i, {
                          statementDay: Math.min(31, Math.max(1, Math.round(v))),
                        })
                      }
                    />
                  </label>
                  <label className="note" style={{ display: "flex", flexDirection: "column" }}>
                    Due day
                    <DecimalInput
                      value={c.paymentDueDay}
                      min={1}
                      max={31}
                      onChange={(v) =>
                        updateCard(i, {
                          paymentDueDay: Math.min(31, Math.max(1, Math.round(v))),
                        })
                      }
                    />
                  </label>
                  <label className="note" style={{ display: "flex", flexDirection: "column" }}>
                    Interest % p.a.
                    <DecimalInput
                      value={c.interestRateApr ?? 0}
                      step={0.01}
                      min={0}
                      onChange={(v) => updateCard(i, { interestRateApr: v })}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn del sm"
                    onClick={() => removeCard(i)}
                  >
                    del
                  </button>
                </div>
                {c.rewardHeadline && (
                  <p className="note card-edit-reward">{c.rewardHeadline}</p>
                )}
              </div>
            ))
          )}
          <div className="toolbar">
            <button type="button" className="btn ghost sm" onClick={addCard} disabled={savingConfig}>
              + Add card
            </button>
          </div>
          </fieldset>
        </div>
      ) : (
        <div className="card table-scroll">
          {creditCards.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
              No credit cards configured. Click Edit to add one.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Bank</th>
                  <th>Rewards</th>
                  <th>Interest %</th>
                  <th>Stmt day</th>
                  <th>Due day</th>
                </tr>
              </thead>
              <tbody>
                {creditCards.map((c, i) => (
                  <tr key={i}>
                    <td>{c.name}</td>
                    <td>{c.bank ?? "—"}</td>
                    <td>
                      {c.rewardHeadline ? (
                        <>
                          <span className={rewardTagClass(c.rewardType)}>
                            {c.rewardType ?? "—"}
                          </span>
                          <div className="note" style={{ marginTop: 4 }}>
                            {c.rewardHeadline}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                    <td className="num">{(c.interestRateApr ?? 0).toFixed(2)}</td>
                    <td className="num">Day {c.statementDay}</td>
                    <td className="num">Day {c.paymentDueDay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {statementsEnabled && (
        <>
          <h2 style={{ marginTop: 24 }}>Statements</h2>
          <p className="note" style={{ marginBottom: 8 }}>
            Latest closed cycle per card. Enter amounts from your bank statement, then save
            and record payment.
          </p>
          {creditCards.length === 0 ? (
            <p className="note" style={{ fontStyle: "italic" }}>
              Add a card above to track statements.
            </p>
          ) : (
            <div className="card table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Card</th>
                    <th>Statement</th>
                    <th>Due</th>
                    <th>Statement amt</th>
                    <th>Min due</th>
                    <th>Outstanding</th>
                    <th>Tracked</th>
                    <th>Untracked</th>
                    <th>Paid</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {creditCards.map((c) => {
                    const cardKey = c.id ?? c.name;
                    const stmt = statementByCardKey.get(cardKey);
                    const rowSaving = stmt != null && savingRow === stmt.id;

                    return (
                      <tr
                        key={cardKey}
                        className={stmt?.isOverdue ? "row-overdue" : undefined}
                      >
                        <td>
                          {c.name}
                          {stmt ? (
                            <div className="note">
                              {fmtDate(stmt.cycleStartDate)} –{" "}
                              {fmtDate(stmt.cycleEndDate)}
                              {stmt.carriedForwardIn > 0
                                ? ` · carried ${fmt2(stmt.carriedForwardIn)}`
                                : ""}
                            </div>
                          ) : (
                            <div className="note">Syncing statement…</div>
                          )}
                        </td>
                        <td>{stmt ? fmtDate(stmt.statementCloseDate) : "—"}</td>
                        <td>{stmt ? fmtDate(stmt.paymentDueDate) : `Day ${c.paymentDueDay}`}</td>
                        <td className="num">
                          {stmt && !stmt.paidAt ? (
                            <DecimalTextInput
                              style={{ width: 88 }}
                              disabled={rowSaving}
                              value={
                                draftActual[stmt.id] ??
                                (stmt.actualAmount != null
                                  ? String(stmt.actualAmount)
                                  : "")
                              }
                              placeholder="Add"
                              onChange={(v) =>
                                setDraftActual((prev) => ({
                                  ...prev,
                                  [stmt.id]: v,
                                }))
                              }
                            />
                          ) : stmt ? (
                            fmt2(stmt.actualAmount ?? 0)
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num">
                          {stmt && !stmt.paidAt ? (
                            <DecimalTextInput
                              style={{ width: 88 }}
                              disabled={rowSaving}
                              value={
                                draftMinDue[stmt.id] ??
                                (stmt.minimumDue != null
                                  ? String(stmt.minimumDue)
                                  : "")
                              }
                              placeholder="Add"
                              onChange={(v) =>
                                setDraftMinDue((prev) => ({
                                  ...prev,
                                  [stmt.id]: v,
                                }))
                              }
                            />
                          ) : stmt?.minimumDue != null ? (
                            fmt2(stmt.minimumDue)
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num">
                          {stmt ? fmt2(stmt.outstandingBalance) : "—"}
                        </td>
                        <td className="num">
                          {stmt ? fmt2(stmt.trackedAmount) : "—"}
                        </td>
                        <td className="num">
                          {stmt?.untrackedAmount != null
                            ? fmt2(stmt.untrackedAmount)
                            : "—"}
                        </td>
                        <td>
                          {stmt?.paidAt
                            ? `Yes ${fmt2(stmt.amountPaid)}`
                            : stmt && stmt.amountPaid > 0
                              ? `Partial ${fmt2(stmt.amountPaid)}`
                              : "No"}
                        </td>
                        <td>
                          {stmt && !stmt.paidAt ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <button
                                type="button"
                                className="btn ghost sm"
                                disabled={rowSaving || savingConfig}
                                onClick={() => void saveStatementRow(stmt)}
                              >
                                {rowSaving ? "Saving…" : "Save"}
                              </button>
                              {stmt.outstandingBalance > 0 ||
                              (stmt.actualAmount != null && stmt.actualAmount > 0) ? (
                                <button
                                  type="button"
                                  className="btn sm"
                                  disabled={rowSaving || savingConfig}
                                  onClick={() => setPayStatement(stmt)}
                                >
                                  Pay
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!statementsEnabled && (
        <p className="note" style={{ marginTop: 16 }}>
          Sign in with cloud sync to use statement cycles, tracked spend, and payments.
        </p>
      )}

      <h2 style={{ marginTop: 24 }}>Which card to use?</h2>
      <div className="card card-advisor">
        <p className="note" style={{ marginTop: 0 }}>
          Compares only cards in your wallet that were picked from the catalog. Caps and
          min-spend are shown as reminders — not enforced in the estimate.
        </p>
        <div className="card-advisor-form">
          <label>
            Spend amount (SGD)
            <DecimalInput value={spendAmount} step={10} onChange={setSpendAmount} />
          </label>
          <label>
            Category
            <select
              value={spendCategory}
              onChange={(e) => setSpendCategory(e.target.value as SpendCategory)}
            >
              {SPEND_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {SPEND_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prefer
            <select
              value={preference}
              onChange={(e) => setPreference(e.target.value as RewardPreference)}
            >
              <option value="best">Best value (miles vs cashback)</option>
              <option value="miles">Miles</option>
              <option value="cashback">Cashback</option>
            </select>
          </label>
          <button type="button" className="btn sm" onClick={runAdvisor}>
            Suggest card
          </button>
        </div>
        {recommendation ? (
          <div className="card-advisor-result">
            <div className="lbl">Use this card</div>
            <div className="val" style={{ fontSize: "1.25rem" }}>
              {recommendation.cardName}
              {recommendation.bank ? ` (${recommendation.bank})` : ""}
            </div>
            <p>
              <b>{recommendation.reason}</b>
              {recommendation.estimatedMiles != null &&
                recommendation.estimatedMiles > 0 && (
                  <> · Est. {Math.round(recommendation.estimatedMiles)} miles</>
                )}
              {recommendation.estimatedCashback != null &&
                recommendation.estimatedCashback > 0 && (
                  <> · Est. {fmt2(recommendation.estimatedCashback)} cashback</>
                )}
            </p>
            {recommendation.caveat && (
              <p className="note" style={{ color: "var(--rust)" }}>
                {recommendation.caveat}
              </p>
            )}
          </div>
        ) : (
          <p className="note" style={{ marginBottom: 0 }}>
            {creditCards.some((c) => c.catalogId)
              ? "Enter amount and category, then suggest."
              : "Edit your cards and select products from the catalog to enable suggestions."}
          </p>
        )}
      </div>

      {payStatement && (
        <CardPaymentModal
          statement={payStatement}
          onClose={() => setPayStatement(null)}
          onPaid={async () => {
            await reloadStatements({ silent: true });
            const { res, data } = await fetchJson<{ otherLoans?: OtherLoan[] }>(
              "/api/other-loans",
              { credentials: "include" }
            );
            if (res.ok) {
              setState((prev) => ({ ...prev, otherLoans: data.otherLoans ?? prev.otherLoans }));
            }
            snackbar.show("Payment recorded");
          }}
        />
      )}

      <Snackbar
        message={snackbar.message}
        variant={snackbar.variant}
        durationMs={snackbar.durationMs}
        onDismiss={snackbar.dismiss}
      />
    </section>
  );
}
