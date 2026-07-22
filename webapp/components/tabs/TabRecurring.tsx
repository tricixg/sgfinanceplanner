"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  RecordRecurringPaymentForm,
  type RecurringPaymentSuccessPayload,
} from "@/components/expenses/RecordRecurringPaymentForm";
import { fetchJson } from "@/lib/fetch-json";
import type { RecurringRow } from "@/lib/recurring/build-rows";
import { RecurringScheduleFields } from "@/components/recurring/RecurringScheduleFields";
import { formatDeductionDayLabel } from "@/lib/recurring/prefill";
import type { BudgetItem, RecurringInvestment, RecurringSubscription } from "@/lib/types";
import { defaultRecurringInvestment, defaultRecurringSubscription } from "@/lib/finance/budget";
import { addMonthsYm } from "@/lib/finance/calendar";
import { currentYm, fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import { DecimalInput } from "@/components/DecimalInput";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import { useDomainEvent } from "@/hooks/useDomainEvent";

const KIND_LABEL: Record<RecurringRow["kind"], string> = {
  debt: "Debt",
  insurance: "Insurance",
  ilp: "ILP",
  subscription: "Other Recurring",
  invest: "Recurring Invest",
};

type FundOption = { id: string; name: string };

type Props = {
  enabled: boolean;
  onReload?: () => void | Promise<void>;
};

export function TabRecurring({ enabled, onReload }: Props) {
  const [viewYm, setViewYm] = useState(currentYm);
  const [rows, setRows] = useState<RecurringRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<RecurringSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payRowKey, setPayRowKey] = useState<string | null>(null);
  const [undoingExpenseId, setUndoingExpenseId] = useState<string | null>(null);
  const [editingSubs, setEditingSubs] = useState(false);
  const [subDraft, setSubDraft] = useState<RecurringSubscription[]>([]);
  const [savingSubs, setSavingSubs] = useState(false);
  const [investments, setInvestments] = useState<RecurringInvestment[]>([]);
  const [editingInvest, setEditingInvest] = useState(false);
  const [investDraft, setInvestDraft] = useState<RecurringInvestment[]>([]);
  const [savingInvest, setSavingInvest] = useState(false);
  const [investError, setInvestError] = useState("");
  const [budgetLines, setBudgetLines] = useState<BudgetItem[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);

  const loadBudgetLines = useCallback(async () => {
    if (!enabled) return;
    const { res, data } = await fetchJson<{ budget?: BudgetItem[] }>("/api/budget-lines", {
      credentials: "include",
    });
    if (res.ok) setBudgetLines(data.budget ?? []);
  }, [enabled]);

  const loadFunds = useCallback(async () => {
    if (!enabled) return;
    const { res, data } = await fetchJson<{ funds?: FundOption[] }>("/api/funds", {
      credentials: "include",
    });
    if (res.ok) setFunds(data.funds ?? []);
  }, [enabled]);

  useEffect(() => {
    void loadBudgetLines();
    void loadFunds();
  }, [loadBudgetLines, loadFunds]);

  useDomainEvent(["budget:changed"], () => {
    void loadBudgetLines();
  });

  useDomainEvent(["funds:changed"], () => {
    void loadFunds();
  });

  const categoryOptions = budgetLines.filter((b) => b.type === "fixed" || b.type === "spend");
  const categoryName = (id?: string) =>
    id ? budgetLines.find((c) => c.id === id)?.cat || null : null;
  const investCategoryOptions = budgetLines.filter((b) => b.type === "invest");
  const fundName = (id?: string) => (id ? funds.find((f) => f.id === id)?.name || null : null);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const { res, data } = await fetchJson<{
        error?: string;
        rows?: RecurringRow[];
        subscriptions?: RecurringSubscription[];
        investments?: RecurringInvestment[];
      }>(`/api/recurring?ym=${viewYm}`, { credentials: "include" });
      if (!res.ok) throw new Error(data.error ?? "Failed to load recurring");
      setRows(data.rows ?? []);
      setSubscriptions(data.subscriptions ?? []);
      setInvestments(data.investments ?? []);
      console.info("[TabRecurring] loaded", { ym: viewYm, rows: data.rows?.length ?? 0 });
    } catch (e) {
      console.error("[TabRecurring] load failed", e);
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, viewYm]);

  useEffect(() => {
    void load();
  }, [load]);

  useDomainEvent(
    ["expense:changed", "loans:changed", "budget:changed", "recurring:changed"],
    () => {
      void load();
    }
  );

  const rowKey = (r: RecurringRow) => `${r.kind}:${r.sourceId}`;

  const deletePayment = async (expenseId: string) => {
    const { res, data } = await fetchJson<{ error?: string }>(`/api/expenses/${expenseId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error(data.error ?? "Failed to undo payment");
    console.info("[TabRecurring] payment deleted", { expenseId });
    dispatchDomainEvent([
      "expense:changed",
      "recurring:changed",
      "loans:changed",
      "accounts:changed",
    ]);
    await load();
    await onReload?.();
  };

  const onPaymentSuccess = async (
    key: string,
    payload: RecurringPaymentSuccessPayload
  ) => {
    setRows((prev) =>
      prev.map((r) =>
        rowKey(r) === key
          ? {
              ...r,
              paid: true,
              payment: {
                expenseId: payload.expenseId,
                spentAt: payload.spentAt,
                amount: payload.amount,
                financialAccountId: payload.financialAccountId,
                accountName: payload.accountName,
              },
            }
          : r
      )
    );
    setPayRowKey(null);
    void load();
    void onReload?.();
  };

  const startEditSubs = () => {
    setSubDraft(subscriptions.length ? subscriptions.map((s) => ({ ...s })) : []);
    setEditingSubs(true);
  };

  const saveSubs = async () => {
    setSavingSubs(true);
    try {
      const { res, data } = await fetchJson<{ error?: string; items?: RecurringSubscription[] }>(
        "/api/recurring-subscriptions",
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: subDraft }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to save subscriptions");
      setSubscriptions(data.items ?? []);
      setEditingSubs(false);
      console.info("[TabRecurring] subscriptions saved");
      dispatchDomainEvent("recurring:changed");
      await load();
    } catch (e) {
      console.error("[TabRecurring] save subscriptions failed", e);
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingSubs(false);
    }
  };

  const startEditInvest = () => {
    setInvestDraft(investments.length ? investments.map((s) => ({ ...s })) : []);
    setInvestError("");
    setEditingInvest(true);
  };

  const saveInvest = async () => {
    if (investDraft.some((s) => !s.fundId)) {
      setInvestError("Every recurring invest item needs a fund selected.");
      return;
    }
    setSavingInvest(true);
    setInvestError("");
    try {
      const { res, data } = await fetchJson<{ error?: string; items?: RecurringInvestment[] }>(
        "/api/recurring-investments",
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: investDraft }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to save recurring invest items");
      setInvestments(data.items ?? []);
      setEditingInvest(false);
      console.info("[TabRecurring] investments saved");
      dispatchDomainEvent("recurring:changed");
      await load();
    } catch (e) {
      console.error("[TabRecurring] save investments failed", e);
      setInvestError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingInvest(false);
    }
  };

  if (!enabled) {
    return (
      <section className="panel on">
        <p className="note">Sign in to track recurring payments. Records stay private to you.</p>
      </section>
    );
  }

  const todayYm = currentYm();
  const recurringPaymentRows = rows.filter(
    (r) => r.kind !== "subscription" && r.kind !== "invest"
  );
  const subscriptionPaymentRows = rows.filter((r) => r.kind === "subscription");
  const investPaymentRows = rows.filter((r) => r.kind === "invest");
  const paidCount = recurringPaymentRows.filter((r) => r.paid).length;
  const subPaidCount = subscriptionPaymentRows.filter((r) => r.paid).length;
  const investPaidCount = investPaymentRows.filter((r) => r.paid).length;

  const activeSubscriptions = subscriptions.filter(
    (s) => !s.endMonth || s.endMonth >= viewYm
  );
  const archivedSubscriptions = subscriptions.filter(
    (s) => s.endMonth && s.endMonth < viewYm
  );

  const indexedDraft = subDraft.map((s, idx) => ({ sub: s, idx }));
  const activeDraft = indexedDraft.filter(({ sub }) => !sub.endMonth || sub.endMonth >= viewYm);
  const archivedDraft = indexedDraft.filter(({ sub }) => sub.endMonth && sub.endMonth < viewYm);

  const activeTotal = activeSubscriptions.reduce((s, x) => s + x.amount, 0);
  const unassignedActive = activeSubscriptions.filter((s) => !s.budgetLineId);
  const unassignedTotal = unassignedActive.reduce((s, x) => s + x.amount, 0);

  const activeDraftTotal = activeDraft.reduce((s, { sub }) => s + sub.amount, 0);

  const activeInvestments = investments.filter((s) => !s.endMonth || s.endMonth >= viewYm);
  const archivedInvestments = investments.filter((s) => s.endMonth && s.endMonth < viewYm);

  const indexedInvestDraft = investDraft.map((s, idx) => ({ sub: s, idx }));
  const activeInvestDraft = indexedInvestDraft.filter(
    ({ sub }) => !sub.endMonth || sub.endMonth >= viewYm
  );
  const archivedInvestDraft = indexedInvestDraft.filter(
    ({ sub }) => sub.endMonth && sub.endMonth < viewYm
  );

  const investActiveTotal = activeInvestments.reduce((s, x) => s + x.amount, 0);
  const unassignedInvestActive = activeInvestments.filter((s) => !s.budgetLineId);
  const unassignedInvestTotal = unassignedInvestActive.reduce((s, x) => s + x.amount, 0);

  const investDraftTotal = activeInvestDraft.reduce((s, { sub }) => s + sub.amount, 0);

  const renderRecurringRows = (
    list: RecurringRow[],
    emptyMessage: string,
    opts: {
      showType?: boolean;
      showCategory?: boolean;
      showFund?: boolean;
      colSpan?: number;
    } = {}
  ) => {
    const showType = opts.showType !== false;
    const showCategory = opts.showCategory === true;
    const showFund = opts.showFund === true;
    const colSpan =
      opts.colSpan ?? 6 + (showType ? 1 : 0) + (showCategory ? 1 : 0) + (showFund ? 1 : 0);
    if (list.length === 0) {
      return (
        <tr>
          <td colSpan={colSpan} className="note">
            {emptyMessage}
          </td>
        </tr>
      );
    }
    return list.map((row) => {
      const key = rowKey(row);
      const paying = payRowKey === key;
      const paymentExpenseId = row.payment?.expenseId ?? null;
      const undoing = paymentExpenseId != null && undoingExpenseId === paymentExpenseId;
      const linkedBudgetLineId =
        row.kind === "invest"
          ? investments.find((s) => s.id === row.sourceId)?.budgetLineId
          : subscriptions.find((s) => s.id === row.sourceId)?.budgetLineId;
      return (
        <Fragment key={key}>
          <tr>
            {showType ? (
              <td>
                <span className="tag t-soon">{KIND_LABEL[row.kind]}</span>
              </td>
            ) : null}
            <td>{row.name}</td>
            <td className="num">{fmt2(row.amount)}</td>
            {showCategory ? <td>{categoryName(linkedBudgetLineId) ?? "—"}</td> : null}
            {showFund ? <td>{row.fundName ?? fundName(row.fundId ?? undefined) ?? "—"}</td> : null}
            <td>{formatDeductionDayLabel(row.deductionDay)}</td>
            <td>{row.defaultAccountName ?? "—"}</td>
            <td>
              {row.paid && row.payment ? (
                <span className="tag t-live">
                  Paid {row.payment.spentAt.slice(5)}
                  {row.payment.accountName ? ` · ${row.payment.accountName}` : ""}
                </span>
              ) : (
                <span className="tag t-warn">Unpaid</span>
              )}
            </td>
            <td className="recurring-actions">
              {row.paid && row.payment ? (
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={undoing}
                  onClick={() => {
                    if (!paymentExpenseId) return;
                    setUndoingExpenseId(paymentExpenseId);
                    void deletePayment(paymentExpenseId)
                      .catch((err) => {
                        setError(err instanceof Error ? err.message : "Undo failed");
                      })
                      .finally(() => {
                        setUndoingExpenseId(null);
                      });
                  }}
                >
                  {undoing ? "Undo-ing…" : "Undo"}
                </button>
              ) : paying ? null : (
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setPayRowKey(key)}
                >
                  Record payment
                </button>
              )}
            </td>
          </tr>
          {paying ? (
            <tr className="recurring-pay-row">
              <td colSpan={colSpan}>
                <RecordRecurringPaymentForm
                  row={row}
                  onSuccess={(payload) => onPaymentSuccess(key, payload)}
                  onCancel={() => setPayRowKey(null)}
                />
              </td>
            </tr>
          ) : null}
        </Fragment>
      );
    });
  };

  return (
    <section className="panel on">
      <div className="section-head">
        <h2>Recurring payments</h2>
      </div>

      <div className="callout tip">
        Set <b>Due day</b> and <b>Pay from</b> when editing loans (Debts &amp; Loans), insurance (ME),
        or ILP (Investment). Add other recurring items in the table below and record those payments there.
      </div>

      <div className="toolbar" style={{ marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setViewYm(addMonthsYm(viewYm, -1))}
        >
          ← Prev
        </button>
        <span style={{ fontWeight: 600 }}>{formatMonthLabel(viewYm)}</span>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setViewYm(addMonthsYm(viewYm, 1))}
        >
          Next →
        </button>
        {viewYm !== todayYm ? (
          <button type="button" className="btn ghost sm" onClick={() => setViewYm(todayYm)}>
            This month
          </button>
        ) : null}
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="stat accent">
          <div className="lbl">Items</div>
          <div className="val">
            {recurringPaymentRows.length + subscriptionPaymentRows.length + investPaymentRows.length}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Paid this month</div>
          <div className="val">
            {paidCount + subPaidCount + investPaidCount}/
            {recurringPaymentRows.length + subscriptionPaymentRows.length + investPaymentRows.length}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Other Recurring · Recurring Invest</div>
          <div className="val">
            {activeSubscriptions.length} · {activeInvestments.length}
          </div>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <p className="loading">Loading recurring items…</p>
      ) : error ? (
        <p className="note">{error}</p>
      ) : (
        <div className="card table-scroll">
          <table className="recurring-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Name</th>
                <th>Amount / mo</th>
                <th>Due</th>
                <th>Pay from</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {renderRecurringRows(
                recurringPaymentRows,
                "No debt, insurance, or ILP items yet. Configure those on Debts & Loans, ME, or Investment."
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-head" style={{ marginTop: 24 }}>
        <h2>Other Recurring</h2>
        {editingSubs ? (
          <button type="button" className="btn sm" onClick={() => void saveSubs()} disabled={savingSubs}>
            {savingSubs ? "Saving…" : "Done"}
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startEditSubs}>
            Edit
          </button>
        )}
      </div>

      {editingSubs ? (
        <div className="card">
          <div className="editrow head recurring-sub">
            <span>Name</span>
            <span>Amount / mo</span>
            <span>Category</span>
            <span>Ends</span>
            <span>Due day</span>
            <span>Pay from</span>
            <span></span>
          </div>
          {activeDraft.map(({ sub: s, idx: i }) => (
            <div className="editrow recurring-sub" key={i}>
              <input
                type="text"
                placeholder="Name"
                value={s.name}
                onChange={(e) => {
                  const next = [...subDraft];
                  next[i] = { ...s, name: e.target.value };
                  setSubDraft(next);
                }}
              />
              <DecimalInput
                placeholder="Amount"
                value={s.amount}
                onChange={(v) => {
                  const next = [...subDraft];
                  next[i] = { ...s, amount: v };
                  setSubDraft(next);
                }}
              />
              <select
                value={s.budgetLineId ?? ""}
                aria-label="Budget category"
                onChange={(e) => {
                  const next = [...subDraft];
                  next[i] = { ...s, budgetLineId: e.target.value || undefined };
                  setSubDraft(next);
                }}
              >
                <option value="">No category</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cat}
                  </option>
                ))}
              </select>
              <input
                type="month"
                value={s.endMonth ?? ""}
                onChange={(e) => {
                  const next = [...subDraft];
                  next[i] = { ...s, endMonth: e.target.value || undefined };
                  setSubDraft(next);
                }}
              />
              <RecurringScheduleFields
                inline
                deductionDay={s.deductionDay}
                defaultFinancialAccountId={s.defaultFinancialAccountId}
                onDeductionDayChange={(day) => {
                  const next = [...subDraft];
                  next[i] = { ...s, deductionDay: day };
                  setSubDraft(next);
                }}
                onAccountChange={(id) => {
                  const next = [...subDraft];
                  next[i] = { ...s, defaultFinancialAccountId: id };
                  setSubDraft(next);
                }}
              />
              <button
                type="button"
                className="btn del sm"
                onClick={() => setSubDraft(subDraft.filter((_, j) => j !== i))}
              >
                del
              </button>
            </div>
          ))}
          {archivedDraft.length > 0 && (
            <details className="debt-archive" style={{ marginTop: 12 }}>
              <summary>Archive — {archivedDraft.length} ended</summary>
              <div style={{ marginTop: 10 }}>
                {archivedDraft.map(({ sub: s, idx: i }) => (
                  <div className="editrow recurring-sub" key={i}>
                    <input
                      type="text"
                      placeholder="Name"
                      value={s.name}
                      onChange={(e) => {
                        const next = [...subDraft];
                        next[i] = { ...s, name: e.target.value };
                        setSubDraft(next);
                      }}
                    />
                    <DecimalInput
                      placeholder="Amount"
                      value={s.amount}
                      onChange={(v) => {
                        const next = [...subDraft];
                        next[i] = { ...s, amount: v };
                        setSubDraft(next);
                      }}
                    />
                    <select
                      value={s.budgetLineId ?? ""}
                      aria-label="Budget category"
                      onChange={(e) => {
                        const next = [...subDraft];
                        next[i] = { ...s, budgetLineId: e.target.value || undefined };
                        setSubDraft(next);
                      }}
                    >
                      <option value="">No category</option>
                      {categoryOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.cat}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="YYYY-MM"
                      value={s.endMonth ?? ""}
                      onChange={(e) => {
                        const next = [...subDraft];
                        next[i] = { ...s, endMonth: e.target.value || undefined };
                        setSubDraft(next);
                      }}
                    />
                    <RecurringScheduleFields
                      inline
                      deductionDay={s.deductionDay}
                      defaultFinancialAccountId={s.defaultFinancialAccountId}
                      onDeductionDayChange={(day) => {
                        const next = [...subDraft];
                        next[i] = { ...s, deductionDay: day };
                        setSubDraft(next);
                      }}
                      onAccountChange={(id) => {
                        const next = [...subDraft];
                        next[i] = { ...s, defaultFinancialAccountId: id };
                        setSubDraft(next);
                      }}
                    />
                    <button
                      type="button"
                      className="btn del sm"
                      onClick={() => setSubDraft(subDraft.filter((_, j) => j !== i))}
                    >
                      del
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
          <div className="toolbar">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setSubDraft([...subDraft, defaultRecurringSubscription()])}
            >
              + Add other recurring
            </button>
            <span className="note">Total / mo: {fmt2(activeDraftTotal)}</span>
          </div>
        </div>
      ) : activeSubscriptions.length === 0 && archivedSubscriptions.length === 0 ? (
        <p className="note">No other recurring items yet. Click Edit to add Netflix, gym, etc.</p>
      ) : (
        <>
          {activeSubscriptions.length > 0 ? (
            <div className="card table-scroll">
              <table className="recurring-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Amount / mo</th>
                    <th>Category</th>
                    <th>Due</th>
                    <th>Pay from</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activeSubscriptions.flatMap((sub) => {
                    const payRow = sub.id
                      ? subscriptionPaymentRows.find((r) => r.sourceId === sub.id)
                      : undefined;
                    if (payRow) {
                      return renderRecurringRows([payRow], "", {
                        showType: false,
                        showCategory: true,
                      });
                    }
                    const day =
                      sub.deductionDay && sub.deductionDay >= 1 && sub.deductionDay <= 31
                        ? sub.deductionDay
                        : null;
                    return (
                      <tr key={sub.id ?? sub.name}>
                        <td>{sub.name || "—"}</td>
                        <td className="num">{fmt2(sub.amount)}</td>
                        <td>{categoryName(sub.budgetLineId) ?? "—"}</td>
                        <td>{formatDeductionDayLabel(day)}</td>
                        <td>—</td>
                        <td>
                          {sub.amount > 0 ? (
                            <span className="tag t-warn">Unpaid</span>
                          ) : (
                            <span className="note">Set amount in Edit</span>
                          )}
                        </td>
                        <td />
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total / mo</td>
                    <td className="num">{fmt2(activeTotal)}</td>
                    <td colSpan={5}>
                      {unassignedTotal > 0
                        ? `${fmt2(unassignedTotal)} across ${unassignedActive.length} unassigned item${unassignedActive.length === 1 ? "" : "s"} — not counted toward any budget category`
                        : ""}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="note" style={{ fontStyle: "italic" }}>
              No active other recurring items. See archive below.
            </p>
          )}

          {archivedSubscriptions.length > 0 && (
            <details className="debt-archive">
              <summary>
                Archive — {archivedSubscriptions.length} ended item{archivedSubscriptions.length === 1 ? "" : "s"}
              </summary>
              <div className="card table-scroll" style={{ marginTop: 0, borderTop: "none" }}>
                <table className="recurring-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Amount / mo</th>
                      <th>Ended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedSubscriptions.map((sub) => (
                      <tr key={sub.id ?? sub.name}>
                        <td>{sub.name || "—"}</td>
                        <td className="num">{fmt2(sub.amount)}</td>
                        <td>{sub.endMonth}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}

      <div className="section-head" style={{ marginTop: 24 }}>
        <h2>Recurring Invest</h2>
        {editingInvest ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => void saveInvest()}
            disabled={savingInvest}
          >
            {savingInvest ? "Saving…" : "Done"}
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startEditInvest}>
            Edit
          </button>
        )}
      </div>

      {editingInvest ? (
        <div className="card">
          {funds.length === 0 ? (
            <p className="note">
              No investment funds yet. Add one on the Investment tab before setting up a
              recurring invest item.
            </p>
          ) : null}
          {investError ? <p className="note">{investError}</p> : null}
          <div className="editrow head recurring-invest">
            <span>Name</span>
            <span>Amount / mo</span>
            <span>Category</span>
            <span>Fund</span>
            <span>Ends</span>
            <span>Due day</span>
            <span>Pay from</span>
            <span></span>
          </div>
          {activeInvestDraft.map(({ sub: s, idx: i }) => (
            <div className="editrow recurring-invest" key={i}>
              <input
                type="text"
                placeholder="Name"
                value={s.name}
                onChange={(e) => {
                  const next = [...investDraft];
                  next[i] = { ...s, name: e.target.value };
                  setInvestDraft(next);
                }}
              />
              <DecimalInput
                placeholder="Amount"
                value={s.amount}
                onChange={(v) => {
                  const next = [...investDraft];
                  next[i] = { ...s, amount: v };
                  setInvestDraft(next);
                }}
              />
              <select
                value={s.budgetLineId ?? ""}
                aria-label="Budget category"
                onChange={(e) => {
                  const next = [...investDraft];
                  next[i] = { ...s, budgetLineId: e.target.value || undefined };
                  setInvestDraft(next);
                }}
              >
                <option value="">No category</option>
                {investCategoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cat}
                  </option>
                ))}
              </select>
              <select
                value={s.fundId ?? ""}
                aria-label="Fund"
                required
                onChange={(e) => {
                  const next = [...investDraft];
                  next[i] = { ...s, fundId: e.target.value };
                  setInvestDraft(next);
                }}
              >
                <option value="">Choose fund…</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <input
                type="month"
                value={s.endMonth ?? ""}
                onChange={(e) => {
                  const next = [...investDraft];
                  next[i] = { ...s, endMonth: e.target.value || undefined };
                  setInvestDraft(next);
                }}
              />
              <RecurringScheduleFields
                inline
                deductionDay={s.deductionDay}
                defaultFinancialAccountId={s.defaultFinancialAccountId}
                onDeductionDayChange={(day) => {
                  const next = [...investDraft];
                  next[i] = { ...s, deductionDay: day };
                  setInvestDraft(next);
                }}
                onAccountChange={(id) => {
                  const next = [...investDraft];
                  next[i] = { ...s, defaultFinancialAccountId: id };
                  setInvestDraft(next);
                }}
              />
              <button
                type="button"
                className="btn del sm"
                onClick={() => setInvestDraft(investDraft.filter((_, j) => j !== i))}
              >
                del
              </button>
            </div>
          ))}
          {archivedInvestDraft.length > 0 && (
            <details className="debt-archive" style={{ marginTop: 12 }}>
              <summary>Archive — {archivedInvestDraft.length} ended</summary>
              <div style={{ marginTop: 10 }}>
                {archivedInvestDraft.map(({ sub: s, idx: i }) => (
                  <div className="editrow recurring-invest" key={i}>
                    <input
                      type="text"
                      placeholder="Name"
                      value={s.name}
                      onChange={(e) => {
                        const next = [...investDraft];
                        next[i] = { ...s, name: e.target.value };
                        setInvestDraft(next);
                      }}
                    />
                    <DecimalInput
                      placeholder="Amount"
                      value={s.amount}
                      onChange={(v) => {
                        const next = [...investDraft];
                        next[i] = { ...s, amount: v };
                        setInvestDraft(next);
                      }}
                    />
                    <select
                      value={s.budgetLineId ?? ""}
                      aria-label="Budget category"
                      onChange={(e) => {
                        const next = [...investDraft];
                        next[i] = { ...s, budgetLineId: e.target.value || undefined };
                        setInvestDraft(next);
                      }}
                    >
                      <option value="">No category</option>
                      {investCategoryOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.cat}
                        </option>
                      ))}
                    </select>
                    <select
                      value={s.fundId ?? ""}
                      aria-label="Fund"
                      required
                      onChange={(e) => {
                        const next = [...investDraft];
                        next[i] = { ...s, fundId: e.target.value };
                        setInvestDraft(next);
                      }}
                    >
                      <option value="">Choose fund…</option>
                      {funds.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="YYYY-MM"
                      value={s.endMonth ?? ""}
                      onChange={(e) => {
                        const next = [...investDraft];
                        next[i] = { ...s, endMonth: e.target.value || undefined };
                        setInvestDraft(next);
                      }}
                    />
                    <RecurringScheduleFields
                      inline
                      deductionDay={s.deductionDay}
                      defaultFinancialAccountId={s.defaultFinancialAccountId}
                      onDeductionDayChange={(day) => {
                        const next = [...investDraft];
                        next[i] = { ...s, deductionDay: day };
                        setInvestDraft(next);
                      }}
                      onAccountChange={(id) => {
                        const next = [...investDraft];
                        next[i] = { ...s, defaultFinancialAccountId: id };
                        setInvestDraft(next);
                      }}
                    />
                    <button
                      type="button"
                      className="btn del sm"
                      onClick={() => setInvestDraft(investDraft.filter((_, j) => j !== i))}
                    >
                      del
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
          <div className="toolbar">
            <button
              type="button"
              className="btn ghost sm"
              disabled={funds.length === 0}
              onClick={() =>
                setInvestDraft([...investDraft, defaultRecurringInvestment(funds[0]?.id ?? "")])
              }
            >
              + Add recurring invest
            </button>
            <span className="note">Total / mo: {fmt2(investDraftTotal)}</span>
          </div>
        </div>
      ) : activeInvestments.length === 0 && archivedInvestments.length === 0 ? (
        <p className="note">No recurring invest items yet. Click Edit to add one.</p>
      ) : (
        <>
          {activeInvestments.length > 0 ? (
            <div className="card table-scroll">
              <table className="recurring-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Amount / mo</th>
                    <th>Category</th>
                    <th>Fund</th>
                    <th>Due</th>
                    <th>Pay from</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activeInvestments.flatMap((inv) => {
                    const payRow = inv.id
                      ? investPaymentRows.find((r) => r.sourceId === inv.id)
                      : undefined;
                    if (payRow) {
                      return renderRecurringRows([payRow], "", {
                        showType: false,
                        showCategory: true,
                        showFund: true,
                      });
                    }
                    const day =
                      inv.deductionDay && inv.deductionDay >= 1 && inv.deductionDay <= 31
                        ? inv.deductionDay
                        : null;
                    return (
                      <tr key={inv.id ?? inv.name}>
                        <td>{inv.name || "—"}</td>
                        <td className="num">{fmt2(inv.amount)}</td>
                        <td>{categoryName(inv.budgetLineId) ?? "—"}</td>
                        <td>{fundName(inv.fundId) ?? "—"}</td>
                        <td>{formatDeductionDayLabel(day)}</td>
                        <td>—</td>
                        <td>
                          {inv.amount > 0 ? (
                            <span className="tag t-warn">Unpaid</span>
                          ) : (
                            <span className="note">Set amount in Edit</span>
                          )}
                        </td>
                        <td />
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total / mo</td>
                    <td className="num">{fmt2(investActiveTotal)}</td>
                    <td colSpan={6}>
                      {unassignedInvestTotal > 0
                        ? `${fmt2(unassignedInvestTotal)} across ${unassignedInvestActive.length} unassigned item${unassignedInvestActive.length === 1 ? "" : "s"} — not counted toward any budget category`
                        : ""}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="note" style={{ fontStyle: "italic" }}>
              No active recurring invest items. See archive below.
            </p>
          )}

          {archivedInvestments.length > 0 && (
            <details className="debt-archive">
              <summary>
                Archive — {archivedInvestments.length} ended item
                {archivedInvestments.length === 1 ? "" : "s"}
              </summary>
              <div className="card table-scroll" style={{ marginTop: 0, borderTop: "none" }}>
                <table className="recurring-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Amount / mo</th>
                      <th>Fund</th>
                      <th>Ended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedInvestments.map((inv) => (
                      <tr key={inv.id ?? inv.name}>
                        <td>{inv.name || "—"}</td>
                        <td className="num">{fmt2(inv.amount)}</td>
                        <td>{fundName(inv.fundId) ?? "—"}</td>
                        <td>{inv.endMonth}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
