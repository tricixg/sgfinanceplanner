"use client";

import { useState } from "react";
import { DecimalTextInput } from "@/components/DecimalInput";
import { sgtNowInputDateTime } from "@/lib/time/sgt";

export type RecordTransactionKind = "deposit" | "withdrawal";

type Props = {
  /** Label on the button that opens the form (default: Add). */
  addLabel?: string;
  /** When true, user can choose deposit or withdrawal (ME cash accounts). */
  allowWithdrawal?: boolean;
  onSubmit: (payload: {
    amount: number;
    occurredAt: string;
    note: string;
    kind: RecordTransactionKind;
  }) => Promise<void>;
};

export function RecordSavingsForm({
  addLabel = "Add",
  allowWithdrawal = false,
  onSubmit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RecordTransactionKind>("deposit");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => sgtNowInputDateTime());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const resetFields = () => {
    setAmount("");
    setNote("");
    setDate(sgtNowInputDateTime());
    setKind("deposit");
    setError("");
  };

  const close = () => {
    setOpen(false);
    resetFields();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a positive amount");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSubmit({
        amount: n,
        occurredAt: new Date(date).toISOString(),
        note: note.trim(),
        kind: allowWithdrawal ? kind : "deposit",
      });
      console.info("[RecordSavingsForm] recorded", { kind, amount: n });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            setOpen(true);
            console.info("[RecordSavingsForm] opened");
          }}
        >
          {addLabel}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="toolbar"
      style={{ flexWrap: "wrap", marginTop: 8 }}
    >
      {allowWithdrawal ? (
        <div className="toolbar" style={{ width: "100%", gap: 8 }}>
          <label className="ctrl" style={{ fontSize: 13 }}>
            <input
              type="radio"
              name={`tx-kind-${addLabel}`}
              checked={kind === "deposit"}
              onChange={() => setKind("deposit")}
            />
            Deposit
          </label>
          <label className="ctrl" style={{ fontSize: 13 }}>
            <input
              type="radio"
              name={`tx-kind-${addLabel}`}
              checked={kind === "withdrawal"}
              onChange={() => setKind("withdrawal")}
            />
            Withdrawal
          </label>
        </div>
      ) : null}
      <DecimalTextInput
        placeholder="Amount"
        value={amount}
        onChange={setAmount}
        autoFocus
      />
      <input
        type="datetime-local"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <input
        type="text"
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="submit" className="btn sm" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        className="btn ghost sm"
        disabled={busy}
        onClick={close}
      >
        Cancel
      </button>
      {error ? (
        <p className="pin-error" role="alert" style={{ width: "100%" }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
