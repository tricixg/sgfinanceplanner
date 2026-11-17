"use client";

import { useContext, useState } from "react";
import { DecimalInput } from "@/components/DecimalInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { AppDataContext } from "@/contexts/app-data-contexts";
import {
  CPF_BTO_STAGE_LABEL,
  CPF_TXN_CATEGORIES,
  isCpfTxnCategory,
  type CpfBtoStage,
  type CpfFundingSource,
  type CpfTxnCategory,
} from "@/lib/cpf/types";
import { fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import { sgtTodayYmd } from "@/lib/time/sgt";

type Direction = "out" | "in";
type FormCategory = CpfTxnCategory | "contribution";

const OUT_CATEGORIES: CpfTxnCategory[] = [
  "bto_downpayment",
  "bto_bsd",
  "bto_legal_fee",
  "bto_option_fee",
  "bto_loan_shortfall",
  "bto_mortgage",
  "other_withdrawal",
];
const IN_CATEGORIES: FormCategory[] = ["contribution", "housing_grant", "refund", "other_credit"];

function categoryLabel(c: FormCategory): string {
  return c === "contribution" ? "Monthly contribution" : CPF_TXN_CATEGORIES[c].label;
}

/** BTO planner deep link: /cpf?log=<category>&stage=<stage>&amount=<n>#log */
type Prefill = { category: CpfTxnCategory; stage: CpfBtoStage | null; amount: number } | null;

function readPrefill(): Prefill {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const category = q.get("log");
  if (!isCpfTxnCategory(category)) return null;
  const stages = CPF_TXN_CATEGORIES[category].stages;
  const stageParam = q.get("stage") as CpfBtoStage | null;
  const stage = stageParam && stages.includes(stageParam) ? stageParam : (stages[0] ?? null);
  const amount = Number(q.get("amount") ?? 0);
  return { category, stage, amount: Number.isFinite(amount) && amount > 0 ? amount : 0 };
}

function clearPrefillFromUrl() {
  if (typeof window === "undefined" || !window.location.search) return;
  window.history.replaceState(null, "", window.location.pathname + window.location.hash);
}

/**
 * The single place to log CPF movements: monthly contributions (OA/SA/MA),
 * OA withdrawals and credits, and cash-paid BTO bills. BTO rows carry a stage
 * so they reconcile on the BTO planner.
 */
export function CpfTransactionForm() {
  const appData = useContext(AppDataContext);
  const [prefill, setPrefill] = useState<Prefill>(readPrefill);
  const [direction, setDirection] = useState<Direction>("out");
  const [category, setCategory] = useState<FormCategory>(prefill?.category ?? "bto_downpayment");
  const [stage, setStage] = useState<CpfBtoStage | null>(prefill?.stage ?? "afl");
  const [amount, setAmount] = useState(prefill?.amount ?? 0);
  const [txnDate, setTxnDate] = useState(() => sgtTodayYmd());
  const [source, setSource] = useState<CpfFundingSource>("cpf_oa");
  const [note, setNote] = useState("");
  const [month, setMonth] = useState(() => sgtTodayYmd().slice(0, 7));
  const [oa, setOa] = useState(0);
  const [sa, setSa] = useState(0);
  const [ma, setMa] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const isContribution = category === "contribution";
  const meta = isContribution ? null : CPF_TXN_CATEGORIES[category];
  const stages = meta?.stages ?? [];
  const cashAllowed = Boolean(meta && meta.direction === "debit" && stages.length > 0);

  const pickCategory = (next: FormCategory) => {
    setCategory(next);
    const nextStages = next === "contribution" ? [] : CPF_TXN_CATEGORIES[next].stages;
    setStage(nextStages[0] ?? null);
    if (next === "contribution" || CPF_TXN_CATEGORIES[next].direction !== "debit" || nextStages.length === 0) {
      setSource("cpf_oa");
    }
    setPrefill(null);
    setError("");
  };

  const pickDirection = (next: Direction) => {
    setDirection(next);
    pickCategory(next === "in" ? "contribution" : "bto_downpayment");
  };

  const submit = async () => {
    if (!appData) return;
    setError("");
    setDone("");
    setSaving(true);
    try {
      if (isContribution) {
        if (oa <= 0 && sa <= 0 && ma <= 0) throw new Error("Enter at least one non-zero contribution amount");
        await appData.addCpfContribution({ month: `${month}-01`, oa, sa, ma, note: note.trim() || undefined });
        setDone(`Logged ${formatMonthLabel(month)} contribution · ${fmt2(oa + sa + ma)}`);
        setOa(0);
        setSa(0);
        setMa(0);
      } else {
        if (amount <= 0) throw new Error("Enter an amount above $0");
        await appData.addCpfTransaction({
          txnDate,
          category,
          amount,
          fundingSource: cashAllowed ? source : "cpf_oa",
          btoStage: stage,
          note,
        });
        setDone(
          source === "cash" && cashAllowed
            ? `Logged ${fmt2(amount)} cash · CPF OA unchanged`
            : `Logged ${categoryLabel(category).toLowerCase()} · ${fmt2(amount)}`
        );
        setAmount(0);
        setPrefill(null);
        clearPrefillFromUrl();
      }
      setNote("");
      console.info("[CpfTransactionForm] logged", { category });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log");
    } finally {
      setSaving(false);
    }
  };

  const hint = isContribution
    ? "Adds to OA, SA and MediSave. One entry per month."
    : prefill && prefill.category === category && prefill.amount > 0
      ? `From your BTO planner: ${fmt2(prefill.amount)} still to pay for ${categoryLabel(category).toLowerCase()}${stage ? ` (${CPF_BTO_STAGE_LABEL[stage]})` : ""}.`
      : source === "cash" && cashAllowed
        ? "Cash payments count toward the BTO bill but don't change your CPF balance."
        : meta?.direction === "credit"
          ? "Adds to your OA balance."
          : stages.length > 0
            ? "Takes this off your OA balance and counts it toward the BTO bill."
            : "Takes this off your OA balance.";

  return (
    <div className="card cpf-txn-form" id="log">
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2 style={{ margin: 0 }}>Log CPF transaction</h2>
        <SegmentedControl<Direction>
          label="Direction"
          value={direction}
          onChange={pickDirection}
          options={[
            { value: "out", label: "Money out" },
            { value: "in", label: "Money in" },
          ]}
        />
      </div>

      <div className="cpf-txn-grid">
        <label className="bto-field">
          Category
          <select value={category} onChange={(e) => pickCategory(e.target.value as FormCategory)}>
            {(direction === "out" ? OUT_CATEGORIES : IN_CATEGORIES).map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </label>

        {isContribution ? (
          <>
            <label className="bto-field">
              Month
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
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
        ) : (
          <>
            {stages.length > 0 && (
              <label className="bto-field">
                BTO stage
                <select
                  value={stage ?? ""}
                  disabled={stages.length < 2}
                  onChange={(e) => setStage(e.target.value as CpfBtoStage)}
                >
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {CPF_BTO_STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="bto-field">
              Amount
              <DecimalInput value={amount} onChange={setAmount} min={0} step={0.01} />
            </label>
            <label className="bto-field">
              Date
              <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
            </label>
            {cashAllowed && (
              <label className="bto-field">
                Paid from
                <select value={source} onChange={(e) => setSource(e.target.value as CpfFundingSource)}>
                  <option value="cpf_oa">CPF OA</option>
                  <option value="cash">Cash</option>
                </select>
              </label>
            )}
          </>
        )}

        <label className="bto-field cpf-txn-note">
          Note
          <input
            type="text"
            placeholder="Optional"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>

      <div className="cpf-txn-foot">
        <p className="ui-hint" style={{ margin: 0 }}>
          {hint}
        </p>
        <button type="button" className="btn sm" disabled={saving} onClick={() => void submit()}>
          {saving ? "Logging…" : "Log"}
        </button>
      </div>
      {error ? <p className="pin-error">{error}</p> : null}
      {done && !error ? (
        <p className="ui-hint pos" role="status" style={{ marginTop: 8 }}>
          {done}
        </p>
      ) : null}
    </div>
  );
}
