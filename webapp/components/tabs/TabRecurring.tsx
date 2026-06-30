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
import type { RecurringSubscription } from "@/lib/types";
import { defaultRecurringSubscription } from "@/lib/finance/budget";
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
};

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
  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const { res, data } = await fetchJson<{
        error?: string;
        rows?: RecurringRow[];
        subscriptions?: RecurringSubscription[];
      }>(`/api/recurring?ym=${viewYm}`, { credentials: "include" });
      if (!res.ok) throw new Error(data.error ?? "Failed to load recurring");
      setRows(data.rows ?? []);
      setSubscriptions(data.subscriptions ?? []);
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

  if (!enabled) {
    return (
      <section className="panel on">
        <p className="note">Sign in to track recurring payments. Records stay private to you.</p>
      </section>
    );
  }

  const todayYm = currentYm();
  const recurringPaymentRows = rows.filter((r) => r.kind !== "subscription");
  const subscriptionPaymentRows = rows.filter((r) => r.kind === "subscription");
  const paidCount = recurringPaymentRows.filter((r) => r.paid).length;
  const subPaidCount = subscriptionPaymentRows.filter((r) => r.paid).length;

  const activeSubscriptions = subscriptions.filter(
    (s) => !s.endMonth || s.endMonth >= todayYm
  );
  const archivedSubscriptions = subscriptions.filter(
    (s) => s.endMonth && s.endMonth < todayYm
  );

  const indexedDraft = subDraft.map((s, idx) => ({ sub: s, idx }));
  const activeDraft = indexedDraft.filter(({ sub }) => !sub.endMonth || sub.endMonth >= todayYm);
  const archivedDraft = indexedDraft.filter(({ sub }) => sub.endMonth && sub.endMonth < todayYm);

  const renderRecurringRows = (
    list: RecurringRow[],
    emptyMessage: string,
    opts: { showType?: boolean; colSpan?: number } = {}
  ) => {
    const showType = opts.showType !== false;
    const colSpan = opts.colSpan ?? (showType ? 7 : 6);
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
          <div className="val">{recurringPaymentRows.length + subscriptionPaymentRows.length}</div>
        </div>
        <div className="stat">
          <div className="lbl">Paid this month</div>
          <div className="val">
            {paidCount + subPaidCount}/
            {recurringPaymentRows.length + subscriptionPaymentRows.length}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Other Recurring</div>
          <div className="val">{activeSubscriptions.length}</div>
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
                      return renderRecurringRows([payRow], "", { showType: false });
                    }
                    const day =
                      sub.deductionDay && sub.deductionDay >= 1 && sub.deductionDay <= 31
                        ? sub.deductionDay
                        : null;
                    return (
                      <tr key={sub.id ?? sub.name}>
                        <td>{sub.name || "—"}</td>
                        <td className="num">{fmt2(sub.amount)}</td>
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
    </section>
  );
}
