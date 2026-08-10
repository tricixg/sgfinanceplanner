"use client";

import { useEffect, useMemo, useState } from "react";
import type { Holding } from "@/lib/types";
import { fmt2 } from "@/lib/finance/helpers";
import { DecimalTextInput } from "@/components/DecimalInput";
import { sgtTodayYmd } from "@/lib/time/sgt";
import { TransactionList } from "@/components/savings/TransactionList";

type Props = {
  /** Holdings eligible for dividends (saved rows only — have a real DB id). */
  holdings: Holding[];
  initialHoldingId?: string | null;
  onClose: () => void;
  txRefresh: number;
  onRecord: (
    holdingId: string,
    payload: { perShare: number; occurredAt: string; note?: string }
  ) => Promise<void>;
  onDelete: (holdingId: string, dividendId: string) => Promise<void>;
};

export function AddDividendModal({
  holdings,
  initialHoldingId,
  onClose,
  txRefresh,
  onRecord,
  onDelete,
}: Props) {
  const [holdingId, setHoldingId] = useState(
    () => initialHoldingId ?? holdings[0]?.id ?? ""
  );
  const [perShare, setPerShare] = useState("");
  const [date, setDate] = useState(() => sgtTodayYmd());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyKey, setHistoryKey] = useState(txRefresh);

  const holding = useMemo(
    () => holdings.find((h) => h.id === holdingId) ?? holdings[0] ?? null,
    [holdings, holdingId]
  );

  useEffect(() => {
    setHistoryKey(txRefresh);
  }, [txRefresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        console.info("[AddDividendModal] closed via Escape");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const perShareNum = parseFloat(perShare);
  const total = holding && Number.isFinite(perShareNum) ? perShareNum * holding.qty : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holding?.id) {
      setError("Select a holding");
      return;
    }
    if (!Number.isFinite(perShareNum) || perShareNum <= 0) {
      setError("Enter a positive dividend per share");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onRecord(holding.id, {
        perShare: perShareNum,
        occurredAt: date,
        note: note.trim() || undefined,
      });
      setPerShare("");
      setNote("");
      setHistoryKey((k) => k + 1);
      console.info("[AddDividendModal] recorded", {
        holdingId: holding.id,
        perShare: perShareNum,
        total,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record dividend");
    } finally {
      setBusy(false);
    }
  };

  if (!holding) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dividend-title"
      >
        <div className="modal-header">
          <div>
            <h3 id="dividend-title" style={{ margin: 0 }}>
              Add dividend
            </h3>
            <p className="note" style={{ margin: "4px 0 0" }}>
              Qty held: <strong>{holding.qty.toLocaleString()}</strong> · Realized P&amp;L
              (dividends): <strong>{fmt2(holding.lifetimeDividends ?? 0)}</strong>
            </p>
          </div>
          <button type="button" className="btn ghost sm" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} className="modal-form">
          <label className="ctrl" style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
            <span style={{ display: "block", marginBottom: 4, color: "var(--muted)" }}>
              Holding
            </span>
            <select
              value={holdingId}
              onChange={(e) => setHoldingId(e.target.value)}
              style={{ width: "100%" }}
            >
              {holdings.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name || h.ticker || "Holding"} ({h.ticker || "—"})
                </option>
              ))}
            </select>
          </label>

          <div className="toolbar" style={{ flexWrap: "wrap" }}>
            <DecimalTextInput
              placeholder="Dividend per share"
              aria-label="Dividend per share"
              value={perShare}
              onChange={setPerShare}
              autoFocus
            />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
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
          </div>
          <p className="note" style={{ margin: "8px 0 0" }}>
            Total: <strong>{fmt2(total)}</strong> ({holding.qty.toLocaleString()} ×{" "}
            {Number.isFinite(perShareNum) ? perShareNum : 0})
          </p>
          {error ? (
            <p className="pin-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <div className="modal-history">
          <h4 style={{ margin: "16px 0 8px", fontSize: 14 }}>Dividend history</h4>
          <TransactionList
            fetchUrl={`/api/holdings/${holding.id}/dividends?limit=5`}
            refreshKey={historyKey}
            onDelete={(dividendId) => onDelete(holding.id!, dividendId)}
          />
        </div>
      </div>
    </div>
  );
}
