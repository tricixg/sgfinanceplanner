"use client";

import { useMemo, useState } from "react";
import { DecimalTextInput } from "@/components/DecimalInput";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2 } from "@/lib/finance/helpers";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import { formatTravelSpentAtDisplay } from "@/lib/travel/expense-input";
import type { TravelExpenseRow } from "@/lib/travel/types";

type Props = {
  tripId: string;
  expense: TravelExpenseRow;
  subCategories: string[];
  onClose: () => void;
  onSaved: (msg: string) => void;
};

function toTimeInput(spentTime: string | null | undefined): string {
  const t = spentTime ?? "";
  return t.slice(0, 5);
}

export function TravelExpenseActionModal({
  tripId,
  expense,
  subCategories,
  onClose,
  onSaved,
}: Props) {
  const { accounts } = useFinancialAccounts();
  const [note, setNote] = useState(expense.extraNote);
  const [subCategory, setSubCategory] = useState(expense.subCategory);
  const [date, setDate] = useState(expense.spentAt.slice(0, 10));
  const [time, setTime] = useState(() => toTimeInput(expense.spentTime));
  const [amount, setAmount] = useState(String(expense.amount));
  const [financialAccountId, setFinancialAccountId] = useState(
    expense.financialAccountId ?? ""
  );
  const [reimburseAmount, setReimburseAmount] = useState(String(expense.amount));
  const [reimburseAccountId, setReimburseAccountId] = useState(
    expense.financialAccountId ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const accountOptions = useMemo(() => accounts, [accounts]);
  const txRoute = `/api/transactions/expense/${expense.id}`;
  const whenLabel = formatTravelSpentAtDisplay(expense.spentAt, expense.spentTime);

  const saveEdit = async () => {
    const amt = Number(amount || 0);
    if (!(amt > 0) || !subCategory.trim() || !date) {
      setMsg("Date, subcategory, and amount are required");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const spentAt = time ? `${date}T${time}` : date;
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/travel/trips/${tripId}/expenses/${expense.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt,
            spentAt,
            subCategory: subCategory.trim(),
            note,
            financialAccountId: financialAccountId || null,
          }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      dispatchDomainEvent(["expense:changed", "accounts:changed"]);
      onSaved("Expense updated");
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const reimburse = async () => {
    setBusy(true);
    setMsg("");
    try {
      const { res, data } = await fetchJson<{ error?: string }>(
        `${txRoute}/reimburse`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(reimburseAmount || 0),
            financialAccountId: reimburseAccountId || undefined,
          }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Reimburse failed");
      dispatchDomainEvent(["expense:changed", "accounts:changed", "savings:changed"]);
      onSaved("Reimbursement recorded");
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Reimburse failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this expense and reverse calculations?")) return;
    setBusy(true);
    setMsg("");
    try {
      const { res, data } = await fetchJson<{ error?: string }>(txRoute, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      dispatchDomainEvent(["expense:changed", "accounts:changed"]);
      onSaved("Expense deleted");
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="card modal-panel" style={{ maxWidth: 680 }}>
        <h3>Manage expense</h3>
        <p className="note">
          {whenLabel} · {subCategory} · {fmt2(expense.amount)}
        </p>
        <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0 }}>
          <label>
            Subcategory
            <select value={subCategory} onChange={(e) => setSubCategory(e.target.value)}>
              {subCategories.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label>
            Amount
            <DecimalTextInput value={amount} onChange={setAmount} />
          </label>
          <label>
            Pay from account
            <select
              value={financialAccountId}
              onChange={(e) => setFinancialAccountId(e.target.value)}
            >
              <option value="">No account</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <hr />
          <label>
            Reimburse amount
            <DecimalTextInput value={reimburseAmount} onChange={setReimburseAmount} />
          </label>
          <label>
            Credit account
            <select
              value={reimburseAccountId}
              onChange={(e) => setReimburseAccountId(e.target.value)}
            >
              <option value="">Default original account</option>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        {msg ? (
          <p className="note" style={{ color: "var(--rust)" }}>
            {msg}
          </p>
        ) : null}
        <div className="toolbar">
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button
            type="button"
            className="btn del sm"
            onClick={() => void remove()}
            disabled={busy}
          >
            Delete
          </button>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => void reimburse()}
            disabled={busy}
          >
            Reimburse
          </button>
          <button type="button" className="btn sm" onClick={() => void saveEdit()} disabled={busy}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
