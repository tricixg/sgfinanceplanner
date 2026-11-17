"use client";

import { useContext, useEffect, useState } from "react";
import { BTO_STAGE_ITEMS } from "@/components/bto/BtoLogPaymentForm";
import { DecimalInput } from "@/components/DecimalInput";
import { AppDataContext } from "@/contexts/app-data-contexts";
import {
  CPF_BTO_STAGE_LABEL,
  CPF_TXN_CATEGORIES,
  type CpfBtoStage,
  type CpfContribution,
  type CpfFundingSource,
  type CpfTransaction,
  type CpfTxnCategory,
} from "@/lib/cpf/types";

export type CpfEditTarget =
  | { kind: "contribution"; item: CpfContribution }
  | { kind: "transaction"; item: CpfTransaction };

const OTHER_CATEGORIES: CpfTxnCategory[] = ["refund", "other_credit", "other_withdrawal"];
const STAGES: CpfBtoStage[] = ["booking", "afl", "keys", "mortgage"];

type Props = { target: CpfEditTarget; onClose: () => void };

/** Popup to edit or delete one logged CPF contribution or transaction. */
export function CpfEntryEditModal({ target, onClose }: Props) {
  const appData = useContext(AppDataContext);
  const isContribution = target.kind === "contribution";
  const c = target.kind === "contribution" ? target.item : null;
  const t = target.kind === "transaction" ? target.item : null;
  const isBto = Boolean(t?.btoStage);

  // Contribution fields
  const [month, setMonth] = useState(c ? c.month.slice(0, 7) : "");
  const [creditedOn, setCreditedOn] = useState(c?.creditedOn ?? "");
  const [oa, setOa] = useState(c?.oa ?? 0);
  const [sa, setSa] = useState(c?.sa ?? 0);
  const [ma, setMa] = useState(c?.ma ?? 0);
  // Transaction fields
  const [stage, setStage] = useState<CpfBtoStage | null>(t?.btoStage ?? null);
  const [category, setCategory] = useState<CpfTxnCategory>(t?.category ?? "refund");
  const [amount, setAmount] = useState(t?.amount ?? 0);
  const [txnDate, setTxnDate] = useState(t?.txnDate ?? "");
  const [source, setSource] = useState<CpfFundingSource>(t?.fundingSource ?? "cpf_oa");
  // Shared
  const [note, setNote] = useState((c ?? t)?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = CPF_TXN_CATEGORIES[category];
  const lockedSource: CpfFundingSource | null = meta.cashOnly ? "cash" : meta.cpfOnly ? "cpf_oa" : null;

  const pickStage = (s: CpfBtoStage) => {
    setStage(s);
    const items = BTO_STAGE_ITEMS[s];
    if (!items.includes(category)) setCategory(items[0]!);
  };

  const save = async () => {
    if (!appData) return;
    setError("");
    setBusy(true);
    try {
      if (c) {
        await appData.updateCpfContribution(c.id, {
          month: `${month}-01`,
          oa,
          sa,
          ma,
          note: note.trim(),
          creditedOn: creditedOn || null,
        });
      } else if (t) {
        if (amount <= 0) throw new Error("Enter an amount above $0");
        await appData.updateCpfTransaction(t.id, {
          txnDate,
          category,
          amount,
          fundingSource: lockedSource ?? (isBto ? source : "cpf_oa"),
          btoStage: isBto ? stage : null,
          note: note.trim(),
        });
      }
      console.info("[CpfEntryEditModal] saved", { kind: target.kind });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!appData) return;
    setError("");
    setBusy(true);
    try {
      if (c) await appData.deleteCpfContribution(c.id);
      else if (t) await appData.deleteCpfTransaction(t.id);
      console.info("[CpfEntryEditModal] deleted", { kind: target.kind });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setBusy(false);
    }
  };

  const title = isContribution ? "Edit contribution" : isBto ? "Edit BTO payment" : "Edit transaction";

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card modal-panel">
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button type="button" className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="cpf-edit-grid">
          {c ? (
            <>
              <label className="bto-field">
                Contribution for
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </label>
              <label className="bto-field">
                Credited on
                <input type="date" value={creditedOn} onChange={(e) => setCreditedOn(e.target.value)} />
              </label>
              <label className="bto-field">
                OA
                <DecimalInput value={oa} onChange={setOa} min={0} step={0.01} />
              </label>
              <label className="bto-field">
                SA
                <DecimalInput value={sa} onChange={setSa} min={0} step={0.01} />
              </label>
              <label className="bto-field">
                MediSave
                <DecimalInput value={ma} onChange={setMa} min={0} step={0.01} />
              </label>
            </>
          ) : isBto ? (
            <>
              <label className="bto-field">
                Stage
                <select value={stage ?? ""} onChange={(e) => pickStage(e.target.value as CpfBtoStage)}>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {CPF_BTO_STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="bto-field">
                Item
                <select value={category} onChange={(e) => setCategory(e.target.value as CpfTxnCategory)}>
                  {BTO_STAGE_ITEMS[stage ?? "afl"].map((cat) => (
                    <option key={cat} value={cat}>
                      {CPF_TXN_CATEGORIES[cat].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="bto-field">
                Amount
                <DecimalInput value={amount} onChange={setAmount} min={0} step={0.01} />
              </label>
              <label className="bto-field">
                Date
                <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
              </label>
              <label className="bto-field">
                Paid from
                <select
                  value={lockedSource ?? source}
                  disabled={lockedSource != null}
                  onChange={(e) => setSource(e.target.value as CpfFundingSource)}
                >
                  {lockedSource !== "cash" && <option value="cpf_oa">CPF OA</option>}
                  {lockedSource !== "cpf_oa" && <option value="cash">Cash</option>}
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="bto-field">
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value as CpfTxnCategory)}>
                  {OTHER_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CPF_TXN_CATEGORIES[cat].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="bto-field">
                Amount
                <DecimalInput value={amount} onChange={setAmount} min={0} step={0.01} />
              </label>
              <label className="bto-field">
                Date
                <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
              </label>
            </>
          )}
          <label className="bto-field cpf-edit-wide">
            Note
            <input type="text" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>

        <p className="ui-hint" style={{ marginTop: 10 }}>
          Saving adjusts your CPF balance by the difference.
        </p>
        {error ? <p className="pin-error">{error}</p> : null}

        <div className="cpf-edit-actions">
          {confirmDelete ? (
            <span className="cpf-edit-confirm">
              Delete this entry?
              <button type="button" className="btn sm cpf-edit-danger" disabled={busy} onClick={() => void remove()}>
                {busy ? "Deleting…" : "Yes, delete"}
              </button>
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="btn ghost sm cpf-edit-delete" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn ghost sm" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn sm" disabled={busy || confirmDelete} onClick={() => void save()}>
            {busy && !confirmDelete ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
