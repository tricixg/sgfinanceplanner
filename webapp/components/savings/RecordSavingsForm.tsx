"use client";

import { useState } from "react";

type Props = {
  label?: string;
  onSubmit: (payload: {
    amount: number;
    occurredAt: string;
    note: string;
  }) => Promise<void>;
};

export function RecordSavingsForm({
  label = "Record savings",
  onSubmit,
}: Props) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      });
      setAmount("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="toolbar" style={{ flexWrap: "wrap" }}>
      <span className="note" style={{ width: "100%", marginBottom: 4 }}>
        {label}
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
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
        {busy ? "Saving…" : "Add"}
      </button>
      {error ? (
        <p className="pin-error" role="alert" style={{ width: "100%" }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
