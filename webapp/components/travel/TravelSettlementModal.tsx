"use client";

import { useMemo, useState } from "react";
import { DecimalTextInput } from "@/components/DecimalInput";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import { fetchJson } from "@/lib/fetch-json";
import { sgtTodayYmd } from "@/lib/time/sgt";
import { travelReimbursementDepositNote } from "@/lib/travel/settlement-ledger";
import type { CompanionBalanceRow, TravelSettlementDirection } from "@/lib/travel/types";

type Props = {
  tripId: string;
  tripName: string;
  row: CompanionBalanceRow;
  onClose: () => void;
  onSaved: () => void;
};

export function TravelSettlementModal({ tripId, tripName, row, onClose, onSaved }: Props) {
  const { accounts } = useFinancialAccounts();
  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === "cash" && a.savingsAccountId),
    [accounts]
  );

  const [direction, setDirection] = useState<TravelSettlementDirection>("received");
  const [amount, setAmount] = useState(
    String(Math.max(0, Math.abs(row.pendingReimbursement)).toFixed(2))
  );
  const [settledAt, setSettledAt] = useState(() => sgtTodayYmd());
  const [financialAccountId, setFinancialAccountId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const depositNote = travelReimbursementDepositNote(tripName);
  const syncLedger = direction === "received" && Boolean(financialAccountId);

  const save = async () => {
    const amt = Number(amount || 0);
    if (!(amt > 0) || !settledAt) {
      setMsg("Amount and date required");
      return;
    }
    setBusy(true);
    setMsg("");
    const { res, data } = await fetchJson<{ error?: string }>(
      `/api/travel/trips/${tripId}/settlements`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companionId: row.companionId,
          direction,
          amount: amt,
          settledAt,
          financialAccountId:
            direction === "received" && financialAccountId ? financialAccountId : undefined,
          note: direction === "paid" || (direction === "received" && !financialAccountId)
            ? note
            : undefined,
        }),
      }
    );
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "Failed to record payment");
      return;
    }
    console.info("[TravelSettlementModal] settlement saved", {
      tripId,
      companionId: row.companionId,
      direction,
      amount: amt,
      financialAccountId: direction === "received" ? financialAccountId : null,
    });
    if (syncLedger) {
      dispatchDomainEvent(["savings:changed", "accounts:changed"]);
    }
    onSaved();
    onClose();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="card modal-panel" style={{ maxWidth: 480 }}>
        <h3>Record payment — {row.name}</h3>
        <p className="note">Pending balance: {row.pendingReimbursement.toFixed(2)}</p>
        <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0 }}>
          <label>
            Direction
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as TravelSettlementDirection)}
            >
              <option value="received">They paid me</option>
              <option value="paid">I paid them</option>
            </select>
          </label>
          {direction === "received" ? (
            <label>
              Deposit into
              <select
                value={financialAccountId}
                onChange={(e) => setFinancialAccountId(e.target.value)}
              >
                <option value="">None — travel balance only</option>
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Amount
            <DecimalTextInput value={amount} onChange={setAmount} />
          </label>
          <label>
            Date
            <input type="date" value={settledAt} onChange={(e) => setSettledAt(e.target.value)} />
          </label>
          {syncLedger ? (
            <p className="note">
              Deposit note: {depositNote}
              <br />
              Income category: Others
            </p>
          ) : (
            <label>
              Note
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          )}
        </fieldset>
        {msg ? (
          <p className="note" style={{ color: "var(--rust)" }}>
            {msg}
          </p>
        ) : null}
        <div className="toolbar">
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn sm" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
