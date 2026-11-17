"use client";

import Link from "next/link";
import { useContext, useState } from "react";
import { DecimalInput } from "@/components/DecimalInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { AppDataContext } from "@/contexts/app-data-contexts";
import { CPF_TXN_CATEGORIES, type CpfTxnCategory } from "@/lib/cpf/types";
import { fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import { sgtTodayYmd } from "@/lib/time/sgt";

type Direction = "out" | "in";
type FormCategory = "contribution" | Extract<CpfTxnCategory, "refund" | "other_credit" | "other_withdrawal">;

const IN_CATEGORIES: FormCategory[] = ["contribution", "refund", "other_credit"];
const OUT_CATEGORIES: FormCategory[] = ["other_withdrawal"];

function categoryLabel(c: FormCategory): string {
  return c === "contribution" ? "Monthly contribution" : CPF_TXN_CATEGORIES[c].label;
}

/**
 * CPF Outlook's logging form: monthly contributions (OA/SA/MA) and other,
 * non-BTO OA movements. BTO payments are logged on the BTO planner so they're
 * checked against the plan's bills.
 */
export function CpfTransactionForm() {
  const appData = useContext(AppDataContext);
  const [direction, setDirection] = useState<Direction>("in");
  const [category, setCategory] = useState<FormCategory>("contribution");
  const [amount, setAmount] = useState(0);
  const [txnDate, setTxnDate] = useState(() => sgtTodayYmd());
  const [note, setNote] = useState("");
  const [month, setMonth] = useState(() => sgtTodayYmd().slice(0, 7));
  const [oa, setOa] = useState(0);
  const [sa, setSa] = useState(0);
  const [ma, setMa] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const isContribution = category === "contribution";

  const pickDirection = (next: Direction) => {
    setDirection(next);
    setCategory(next === "in" ? "contribution" : "other_withdrawal");
    setError("");
  };

  const submit = async () => {
    if (!appData) return;
    setError("");
    setDone("");
    setSaving(true);
    try {
      if (category === "contribution") {
        if (oa <= 0 && sa <= 0 && ma <= 0) throw new Error("Enter at least one non-zero contribution amount");
        await appData.addCpfContribution({
          month: `${month}-01`,
          oa,
          sa,
          ma,
          note: note.trim() || undefined,
          creditedOn: txnDate,
        });
        setDone(`Logged ${formatMonthLabel(month)} contribution · ${fmt2(oa + sa + ma)}`);
        setOa(0);
        setSa(0);
        setMa(0);
      } else {
        if (amount <= 0) throw new Error("Enter an amount above $0");
        await appData.addCpfTransaction({ txnDate, category, amount, note });
        setDone(`Logged ${categoryLabel(category).toLowerCase()} · ${fmt2(amount)}`);
        setAmount(0);
      }
      setNote("");
      setTxnDate(sgtTodayYmd());
      console.info("[CpfTransactionForm] logged", { category });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log");
    } finally {
      setSaving(false);
    }
  };

  const hint = isContribution
    ? "Adds to OA, SA and MediSave. One entry per month."
    : direction === "in"
      ? "Adds to your OA balance."
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
            { value: "in", label: "Money in" },
            { value: "out", label: "Money out" },
          ]}
        />
      </div>

      <div className="cpf-txn-grid">
        <label className="bto-field">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as FormCategory)}>
            {(direction === "in" ? IN_CATEGORIES : OUT_CATEGORIES).map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </label>

        {isContribution ? (
          <>
            <label className="bto-field">
              Contribution for
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
            <label className="bto-field">
              Amount
              <DecimalInput value={amount} onChange={setAmount} min={0} step={0.01} />
            </label>
          </>
        )}

        <label className="bto-field">
          {isContribution ? "Credited on" : "Date"}
          <input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
        </label>

        <label className="bto-field cpf-txn-note">
          Note
          <input type="text" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
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
      <p className="ui-hint" style={{ marginTop: 10, marginBottom: 0 }}>
        Paying for your BTO? Log it on the{" "}
        <Link href="/bto#payments">BTO Planner</Link> so it&rsquo;s checked against your bills.
      </p>
    </div>
  );
}
