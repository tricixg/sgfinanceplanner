"use client";

import { useContext, useState } from "react";
import { useSubmitKey } from "@/hooks/useSubmitKey";
import { DecimalInput } from "@/components/DecimalInput";
import { AppDataContext } from "@/contexts/app-data-contexts";
import {
  CPF_BTO_STAGE_LABEL,
  CPF_TXN_CATEGORIES,
  type CpfBtoStage,
  type CpfFundingSource,
  type CpfTxnCategory,
} from "@/lib/cpf/types";
import type { BtoStageReconcile } from "@/lib/finance/bto-reconcile";
import { fmt2 } from "@/lib/finance/helpers";
import { sgtTodayYmd } from "@/lib/time/sgt";

/** What can be logged at each of HDB's fixed payment stages. */
export const BTO_STAGE_ITEMS: Record<CpfBtoStage, CpfTxnCategory[]> = {
  booking: ["bto_option_fee"],
  afl: ["bto_downpayment", "bto_bsd", "bto_legal_fee", "housing_grant"],
  keys: ["bto_downpayment", "bto_loan_shortfall", "housing_grant"],
  mortgage: ["bto_mortgage"],
};

const STAGES: CpfBtoStage[] = ["booking", "afl", "keys", "mortgage"];

/** Amount the plan says is still owed (or, for a grant, still to be credited) for one item. */
export function remainingFor(
  reconcile: Record<CpfBtoStage, BtoStageReconcile>,
  stage: CpfBtoStage,
  category: CpfTxnCategory
): number {
  const r = reconcile[stage];
  if (category === "housing_grant") return Math.max(0, Math.round((r.grantPlanned - r.grantCredited) * 100) / 100);
  if (category === "bto_mortgage") return r.components[0]?.expected ?? 0;
  const c = r.components.find((x) => x.category === category);
  return c ? Math.max(0, Math.round((c.expected - c.paid) * 100) / 100) : 0;
}

function itemLabel(c: CpfTxnCategory): string {
  return c === "housing_grant" ? "Housing grant (credited to OA)" : CPF_TXN_CATEGORIES[c].label;
}

type Props = {
  reconcile: Record<CpfBtoStage, BtoStageReconcile>;
  initialStage: CpfBtoStage;
  initialCategory: CpfTxnCategory;
  /** Pre-filled amount; omit to use what's still owed for the item. */
  initialAmount?: number;
  paired: boolean;
  onClose: () => void;
};

/** Logs one BTO payment (or grant credit) against a stage, from your own CPF OA or cash. */
export function BtoLogPaymentForm({
  reconcile,
  initialStage,
  initialCategory,
  initialAmount,
  paired,
  onClose,
}: Props) {
  const appData = useContext(AppDataContext);
  const submitKey = useSubmitKey();
  const [stage, setStage] = useState<CpfBtoStage>(initialStage);
  const [category, setCategory] = useState<CpfTxnCategory>(initialCategory);
  const [amount, setAmount] = useState(
    () => initialAmount ?? remainingFor(reconcile, initialStage, initialCategory)
  );
  const [source, setSource] = useState<CpfFundingSource>(() =>
    CPF_TXN_CATEGORIES[initialCategory].cashOnly ? "cash" : "cpf_oa"
  );
  const [txnDate, setTxnDate] = useState(() => sgtTodayYmd());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const meta = CPF_TXN_CATEGORIES[category];
  const lockedSource: CpfFundingSource | null = meta.cashOnly ? "cash" : meta.cpfOnly ? "cpf_oa" : null;
  const effectiveSource = lockedSource ?? source;
  const owed = remainingFor(reconcile, stage, category);

  const pickItem = (nextStage: CpfBtoStage, nextCategory: CpfTxnCategory) => {
    setStage(nextStage);
    setCategory(nextCategory);
    setAmount(remainingFor(reconcile, nextStage, nextCategory));
    const m = CPF_TXN_CATEGORIES[nextCategory];
    setSource(m.cashOnly ? "cash" : "cpf_oa");
    setError("");
    setDone("");
  };

  const submit = async () => {
    if (!appData) return;
    setError("");
    setDone("");
    if (amount <= 0) {
      setError("Enter an amount above $0");
      return;
    }
    setSaving(true);
    try {
      const values = {
        txnDate,
        category,
        amount,
        fundingSource: effectiveSource,
        btoStage: stage,
        note,
      };
      // Same key when this entry is re-submitted (double-click / retry).
      await appData.addCpfTransaction({ ...values, clientRequestId: submitKey.keyFor(values) });
      submitKey.reset();
      setDone(
        effectiveSource === "cash"
          ? `Logged ${fmt2(amount)} cash · CPF OA unchanged`
          : meta.direction === "credit"
            ? `Logged ${fmt2(amount)} credited to your OA`
            : `Logged ${fmt2(amount)} from your CPF OA`
      );
      setAmount(0);
      setNote("");
      console.info("[BtoLogPaymentForm] logged", { stage, category, source: effectiveSource });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log payment");
    } finally {
      setSaving(false);
    }
  };

  const hint = meta.cashOnly
    ? "HDB takes the option fee by cash or NETS. Your CPF balance isn't affected."
    : meta.cpfOnly
      ? "HDB credits the grant to your CPF OA before you sign. This adds it to your OA balance."
      : effectiveSource === "cash"
        ? "Counts toward the bill without changing your CPF balance."
        : "Takes this off your CPF OA balance.";

  return (
    <div className="card bto-log-form" id="bto-log">
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>Log BTO payment</h2>
        <button type="button" className="btn ghost sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="cpf-txn-grid">
        <label className="bto-field">
          Stage
          <select
            value={stage}
            onChange={(e) => {
              const s = e.target.value as CpfBtoStage;
              pickItem(s, BTO_STAGE_ITEMS[s][0]!);
            }}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {CPF_BTO_STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="bto-field">
          Item
          <select value={category} onChange={(e) => pickItem(stage, e.target.value as CpfTxnCategory)}>
            {BTO_STAGE_ITEMS[stage].map((c) => (
              <option key={c} value={c}>
                {itemLabel(c)}
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
            value={effectiveSource}
            disabled={lockedSource != null}
            onChange={(e) => setSource(e.target.value as CpfFundingSource)}
          >
            {lockedSource !== "cash" && <option value="cpf_oa">CPF OA</option>}
            {lockedSource !== "cpf_oa" && <option value="cash">Cash</option>}
          </select>
        </label>
        <label className="bto-field cpf-txn-note">
          Note
          <input type="text" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <div className="cpf-txn-foot">
        <p className="ui-hint" style={{ margin: 0 }}>
          {hint}{" "}
          {owed > 0
            ? `Plan says ${fmt2(owed)} ${category === "housing_grant" ? "still to be credited" : "still to pay"} for this item.`
            : category === "bto_mortgage"
              ? ""
              : "Nothing left to pay for this item."}
        </p>
        <button type="button" className="btn sm" disabled={saving} onClick={() => void submit()}>
          {saving ? "Logging…" : "Log payment"}
        </button>
      </div>
      {error ? <p className="pin-error">{error}</p> : null}
      {done && !error ? (
        <p className="ui-hint pos" role="status" style={{ marginTop: 8 }}>
          {done}
        </p>
      ) : null}
      {paired ? (
        <p className="ui-hint" style={{ marginTop: 8, marginBottom: 0 }}>
          This logs your own share. Your partner logs theirs from their account, and both show
          below.
        </p>
      ) : null}
    </div>
  );
}
