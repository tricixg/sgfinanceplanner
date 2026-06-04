"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  RecordRecurringPaymentForm,
  type RecurringPaymentSuccessPayload,
} from "@/components/expenses/RecordRecurringPaymentForm";
import { fetchJson } from "@/lib/fetch-json";
import { dispatchAccountsChanged } from "@/lib/savings/accounts-events";
import type { RecurringRow } from "@/lib/recurring/build-rows";
import { RecurringScheduleFields } from "@/components/recurring/RecurringScheduleFields";
import { formatDeductionDayLabel } from "@/lib/recurring/prefill";
import type { RecurringSubscription } from "@/lib/types";
import { defaultRecurringSubscription } from "@/lib/finance/budget";
import { addMonthsYm } from "@/lib/finance/calendar";
import { currentYm, fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import { DecimalInput } from "@/components/DecimalInput";

const KIND_LABEL: Record<RecurringRow["kind"], string> = {
  debt: "Debt",
  insurance: "Insurance",
  ilp: "ILP",
  subscription: "Subscription",
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

  const rowKey = (r: RecurringRow) => `${r.kind}:${r.sourceId}`;

  const deletePayment = async (expenseId: string) => {
    const { res, data } = await fetchJson<{ error?: string }>(`/api/expenses/${expenseId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error(data.error ?? "Failed to undo payment");
    console.info("[TabRecurring] payment deleted", { expenseId });
    dispatchAccountsChanged("recurring-undo", { expenseId });
    await load();
    await onReload?.();
  };

  const onPaymentSuccess = async (
    key: string,
    payload: RecurringPaymentSuccessPayload
  ) => {
    if (payload.financialAccountId) {
      dispatchAccountsChanged("recurring-pay", { expenseId: payload.expenseId });
    }
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
        or ILP (Investment). Add subscriptions in the table below and record those payments there.
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
          <div className="lbl">Subscriptions</div>
          <div className="val">{subscriptions.length}</div>
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
        <h2>Subscriptions</h2>
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
          {subDraft.map((s, i) => (
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
          <div className="toolbar">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setSubDraft([...subDraft, defaultRecurringSubscription()])}
            >
              + Add subscription
            </button>
          </div>
        </div>
      ) : subscriptions.length === 0 ? (
        <p className="note">No custom subscriptions yet. Click Edit to add Netflix, gym, etc.</p>
      ) : (
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
              {subscriptions.flatMap((sub) => {
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
      )}
    </section>
  );
}
