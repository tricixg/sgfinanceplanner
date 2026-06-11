"use client";

import { useMemo, useRef, useState } from "react";
import type { UnifiedTransaction } from "@/lib/transactions/types";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { fmtSigned2 } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";
import { DecimalTextInput } from "@/components/DecimalInput";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import type { DomainEventName } from "@/lib/events/domain-events";

type Props = {
  tx: UnifiedTransaction;
  onClose: () => void;
  onSaved: (msg: string) => void;
};

function toDateInput(tx: UnifiedTransaction): string {
  return tx.spentAt ?? tx.occurredAt?.slice(0, 10) ?? "";
}

function toTimeInput(tx: UnifiedTransaction): string {
  const t = tx.spentTime ?? tx.occurredAt?.slice(11, 16) ?? "";
  return t.slice(0, 5);
}

function eventsForTransactionChange(
  recordType: UnifiedTransaction["recordType"]
): DomainEventName[] {
  if (recordType === "savings") {
    return ["savings:changed", "accounts:changed"];
  }
  if (recordType === "expense") {
    return ["expense:changed", "recurring:changed", "loans:changed", "accounts:changed"];
  }
  return ["expense:changed"];
}

export function TransactionActionModal({ tx, onClose, onSaved }: Props) {
  const { accounts } = useFinancialAccounts();
  const [note, setNote] = useState(tx.note ?? "");
  const [category, setCategory] = useState(tx.category ?? "");
  const [date, setDate] = useState(toDateInput(tx));
  const [time, setTime] = useState(toTimeInput(tx));
  const [amount, setAmount] = useState(String(Math.abs(tx.amount || 0)));
  const [reimburseAmount, setReimburseAmount] = useState(
    String(Math.abs(tx.amount || 0))
  );
  const [financialAccountId, setFinancialAccountId] = useState(
    tx.financialAccountId ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const reimburseLock = useRef(false);

  const route = `/api/transactions/${tx.recordType}/${tx.id}`;
  const canEditAmount = tx.recordType === "budget";
  const canEditCategory = tx.recordType !== "savings";
  const canEditTime = true;
  const canReimburse = true;

  const accountOptions = useMemo(() => accounts, [accounts]);

  const saveEdit = async () => {
    setBusy(true);
    setMsg("");
    try {
      const body: Record<string, unknown> = {
        note,
      };
      if (canEditCategory) body.category = category;
      if (canEditAmount) body.amount = Number(amount || 0);

      if (tx.recordType === "savings") {
        if (date) {
          body.occurredAt = `${date}T${time || "00:00"}:00.000Z`;
        }
      } else {
        if (date) body.spentAt = date;
        if (canEditTime && time) body.spentTime = `${time}:00`;
      }

      const { res, data } = await fetchJson<{ error?: string }>(route, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      dispatchDomainEvent(eventsForTransactionChange(tx.recordType));
      onSaved("Transaction updated");
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const reimburse = async () => {
    if (reimburseLock.current || busy) {
      console.info("[TransactionActionModal] reimburse skipped — already in flight");
      return;
    }
    reimburseLock.current = true;
    setBusy(true);
    setMsg("");
    try {
      const { res, data } = await fetchJson<{ error?: string }>(
        `${route}/reimburse`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(reimburseAmount || 0),
            financialAccountId: financialAccountId || undefined,
          }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Reimburse failed");
      console.info("[TransactionActionModal] reimburse ok", { id: tx.id });
      onClose();
      dispatchDomainEvent(eventsForTransactionChange(tx.recordType));
      onSaved("Reimbursement recorded");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Reimburse failed";
      console.warn("[TransactionActionModal] reimburse failed", { id: tx.id, message });
      setMsg(message);
    } finally {
      reimburseLock.current = false;
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this transaction and reverse calculations?")) return;
    setBusy(true);
    setMsg("");
    try {
      const { res, data } = await fetchJson<{ error?: string }>(route, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      dispatchDomainEvent(eventsForTransactionChange(tx.recordType));
      onSaved("Transaction deleted");
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
        <h3>Manage transaction</h3>
        <p className="note">
          {tx.date} {tx.time || "—"} · {tx.typeLabel} · {fmtSigned2(tx.amount)}
        </p>
        <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0 }}>
          <label>
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {canEditCategory ? (
            <label>
              Category
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </label>
          ) : null}
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          {canEditAmount ? (
            <label>
              Amount
              <DecimalTextInput value={amount} onChange={setAmount} />
            </label>
          ) : null}
          {canReimburse ? (
            <>
              <hr />
              <label>
                Reimburse amount
                <DecimalTextInput
                  value={reimburseAmount}
                  onChange={setReimburseAmount}
                />
              </label>
              <label>
                Credit account
                <select
                  value={financialAccountId}
                  onChange={(e) => setFinancialAccountId(e.target.value)}
                >
                  <option value="">Default original account</option>
                  {accountOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
        </fieldset>
        {msg ? <p className="note" style={{ color: "var(--rust)" }}>{msg}</p> : null}
        <div className="toolbar">
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="button" className="btn del sm" onClick={() => void remove()} disabled={busy}>
            Delete
          </button>
          <button type="button" className="btn ghost sm" onClick={() => void reimburse()} disabled={busy}>
            {busy ? "Working…" : "Reimburse"}
          </button>
          <button type="button" className="btn sm" onClick={() => void saveEdit()} disabled={busy}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
