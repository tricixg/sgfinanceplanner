"use client";

import { useRef } from "react";
import type { DashboardState, Loan } from "@/lib/types";
import { DEFAULTS, mergeWithDefaults } from "@/lib/finance/defaults";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  onApply: () => void;
  onSaveNow: () => void;
  onReset: () => void;
  saveMsg: string;
};

function NumInput({
  value,
  onChange,
  step,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step ?? 1}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  );
}

export function TabEdit({
  state: S,
  setState,
  onApply,
  onSaveNow,
  onReset,
  saveMsg,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = <K extends keyof DashboardState>(key: K, val: DashboardState[K]) => {
    setState((prev) => ({ ...prev, [key]: val }));
  };

  const updateLoan = (i: number, key: keyof Loan, val: string | number) => {
    setState((prev) => ({
      ...prev,
      loans: prev.loans.map((l, j) => (j === i ? { ...l, [key]: val } : l)),
    }));
  };

  const addLoan = () => {
    setState((prev) => ({
      ...prev,
      loans: [
        ...prev.loans,
        { name: "New loan", card: "—", monthly: 0, out: 0, end: "2027-01" },
      ],
    }));
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "financial_dashboard_data.json";
    a.click();
  };

  const importJSON = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const imp = JSON.parse(r.result as string);
        setState(mergeWithDefaults(imp));
        onSaveNow();
      } catch {
        console.error("[TabEdit] invalid JSON import");
      }
    };
    r.readAsText(file);
  };

  return (
    <section className="panel on">
      <div className="callout tip">
        Everything below feeds the charts. Changes auto-save to the cloud (when Supabase is configured).
      </div>

      <h2>Income</h2>
      <div className="card">
        <div className="editrow head"><span>Item</span><span>Amount</span><span></span><span></span><span></span></div>
        <div className="editrow">
          <span>Monthly gross salary</span>
          <NumInput value={S.monthlySal} onChange={(v) => patch("monthlySal", v)} />
          <span></span><span></span><span></span>
        </div>
        <div className="editrow">
          <span>Comms allowance / mo (non-CPF)</span>
          <NumInput value={S.comms} onChange={(v) => patch("comms", v)} />
          <span></span><span></span><span></span>
        </div>
        <div className="editrow">
          <span>Salary credit day (1–31)</span>
          <NumInput value={S.salaryCreditDay} onChange={(v) => patch("salaryCreditDay", Math.min(31, Math.max(1, Math.round(v))))} />
          <span></span><span></span><span></span>
        </div>
      </div>

      <h2>Fixed obligations / month</h2>
      <div className="card">
        <div className="editrow">
          <span>Family allowance</span>
          <NumInput value={S.fatty} onChange={(v) => patch("fatty", v)} />
          <span></span><span></span><span></span>
        </div>
        <div className="editrow">
          <span>Household</span>
          <NumInput value={S.house} onChange={(v) => patch("house", v)} />
          <span></span><span></span><span></span>
        </div>
        <div className="editrow">
          <span>Manulife ILP base</span>
          <NumInput value={S.manu} onChange={(v) => patch("manu", v)} />
          <span></span><span></span><span></span>
        </div>
        <div className="editrow">
          <span>Variable spending estimate</span>
          <NumInput value={S.varSpend} onChange={(v) => patch("varSpend", v)} />
          <span></span><span></span><span></span>
        </div>
      </div>

      <h2>Insurance premiums</h2>
      <div className="card">
        <div className="editrow">
          <span>ECI</span>
          <NumInput value={S.eci} step={0.01} onChange={(v) => patch("eci", v)} />
          <span></span><span></span><span></span>
        </div>
        <div className="editrow">
          <span>ManuProtect TPD</span>
          <NumInput value={S.tpd} step={0.01} onChange={(v) => patch("tpd", v)} />
          <span></span><span></span><span></span>
        </div>
        <div className="editrow">
          <span>ReadyProtect PA</span>
          <NumInput value={S.acc} step={0.01} onChange={(v) => patch("acc", v)} />
          <span></span><span></span><span></span>
        </div>
      </div>

      <h2>Loans &amp; instalment plans</h2>
      <div className="card">
        <div className="editrow head">
          <span>Plan</span><span>Monthly $</span><span>Outstanding $</span><span>Ends YYYY-MM</span><span></span>
        </div>
        {S.loans.map((l, i) => (
          <div className="editrow" key={i}>
            <input type="text" value={l.name} onChange={(e) => updateLoan(i, "name", e.target.value)} />
            <NumInput value={l.monthly} step={0.01} onChange={(v) => updateLoan(i, "monthly", v)} />
            <NumInput value={l.out} step={0.01} onChange={(v) => updateLoan(i, "out", v)} />
            <input type="text" value={l.end} onChange={(e) => updateLoan(i, "end", e.target.value)} />
            <button className="btn del sm" onClick={() => setState((p) => ({ ...p, loans: p.loans.filter((_, j) => j !== i) }))}>del</button>
          </div>
        ))}
        <div className="toolbar">
          <button className="btn ghost sm" onClick={addLoan}>+ Add loan</button>
        </div>
      </div>

      <h2>Assets &amp; CPF</h2>
      <div className="card">
        {(
          [
            ["CPF OA", "oa"],
            ["CPF SA", "sa"],
            ["CPF MA", "ma"],
            ["ILP value", "ilp"],
            ["Portfolio value", "moo"],
            ["Margin loan", "margin"],
            ["Cash savings", "cash"],
            ["Card / BT debt", "ccDebt"],
          ] as const
        ).map(([label, key]) => (
          <div className="editrow" key={key}>
            <span>{label}</span>
            <NumInput value={S[key]} step={0.01} onChange={(v) => patch(key, v)} />
            <span></span><span></span><span></span>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <button className="btn" onClick={onApply}>Apply &amp; refresh</button>
        <button className="btn ghost" onClick={onSaveNow}>Save now</button>
        <button className="btn ghost" onClick={exportJSON}>Export JSON</button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import JSON</button>
        <button className="btn del" onClick={onReset}>Reset to defaults</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importJSON(f); e.target.value = ""; }} />
        <span className="save-status">{saveMsg}</span>
      </div>
    </section>
  );
}
