"use client";

import { useRef, useState } from "react";
import type { DashboardState, InsurancePolicy, SavingsAccount } from "@/lib/types";
import {
  cashAccountsTotal,
  computedInsuranceMonthly,
  defaultInsurancePolicy,
  defaultSavingsAccount,
} from "@/lib/finance";
import { createDummyState, mergeWithDefaults } from "@/lib/finance/defaults";
import { fmt, fmt2 } from "@/lib/finance/helpers";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  onApply: () => void;
  onSaveNow: () => void;
  onReset: () => void;
  saveMsg: string;
  userEmail?: string;
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

export function TabMe({
  state: S,
  setState,
  onApply,
  onSaveNow,
  onReset,
  saveMsg,
  userEmail,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingInsurance, setEditingInsurance] = useState(false);
  const [editingAccounts, setEditingAccounts] = useState(false);
  const insuranceTotal = computedInsuranceMonthly(S);
  const cashTotal = cashAccountsTotal(S);

  const patch = <K extends keyof DashboardState>(key: K, val: DashboardState[K]) => {
    setState((prev) => ({ ...prev, [key]: val }));
    console.log("[TabMe] patched", key, val);
  };

  const updatePolicy = (i: number, patchPolicy: Partial<InsurancePolicy>) => {
    setState((prev) => ({
      ...prev,
      insurancePolicies: prev.insurancePolicies.map((p, j) =>
        j === i ? { ...p, ...patchPolicy } : p
      ),
    }));
    console.log("[TabMe] updated insurance", i, patchPolicy);
  };

  const addPolicy = () => {
    setState((prev) => ({
      ...prev,
      insurancePolicies: [...prev.insurancePolicies, defaultInsurancePolicy()],
    }));
    console.log("[TabMe] added insurance policy");
  };

  const removePolicy = (i: number) => {
    setState((prev) => ({
      ...prev,
      insurancePolicies: prev.insurancePolicies.filter((_, j) => j !== i),
    }));
    console.log("[TabMe] removed insurance policy", i);
  };

  const updateAccount = (i: number, patchAccount: Partial<SavingsAccount>) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a, j) => (j === i ? { ...a, ...patchAccount } : a)),
    }));
    console.log("[TabMe] updated account", i, patchAccount);
  };

  const addAccount = () => {
    setState((prev) => ({
      ...prev,
      accounts: [...prev.accounts, defaultSavingsAccount()],
    }));
    console.log("[TabMe] added savings account");
  };

  const removeAccount = (i: number) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.filter((_, j) => j !== i),
    }));
    console.log("[TabMe] removed account", i);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "financial_dashboard_data.json";
    a.click();
  };

  const loadDummyData = () => {
    if (
      !confirm(
        "Replace all current data with sample dummy data? You can still Reset or Import JSON to undo."
      )
    ) {
      console.log("[TabMe] add dummy data cancelled");
      return;
    }
    setState(createDummyState());
    onSaveNow();
    onApply();
    console.log("[TabMe] loaded dummy data");
  };

  const importJSON = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const imp = JSON.parse(r.result as string);
        setState(mergeWithDefaults(imp));
        onSaveNow();
      } catch {
        console.error("[TabMe] invalid JSON import");
      }
    };
    r.readAsText(file);
  };

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Your salary, savings accounts, and non-ILP insurance live here. Account balances
        total <b>{fmt(cashTotal)}</b> (used for net worth and cashflow). Insurance premiums
        total <b>{fmt(insuranceTotal)}/mo</b> and flow to <b>Budget &amp; Savings</b>. CPF is on{" "}
        <b>CPF Outlook</b>; ILP is on <b>Investment</b>. Changes auto-save to Supabase and this browser.
      </div>

      <h2>Salary</h2>
      <div className="card">
        <div className="editrow head">
          <span>Item</span>
          <span>Amount</span>
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className="editrow">
          <span>Monthly gross salary</span>
          <NumInput value={S.monthlySal} onChange={(v) => patch("monthlySal", v)} />
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className="editrow">
          <span>Comms allowance / mo (non-CPF)</span>
          <NumInput value={S.comms} onChange={(v) => patch("comms", v)} />
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className="editrow">
          <span>Salary credit day (1–31)</span>
          <NumInput
            value={S.salaryCreditDay}
            onChange={(v) =>
              patch("salaryCreditDay", Math.min(31, Math.max(1, Math.round(v))))
            }
          />
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>

      <div className="section-head">
        <h2>Insurance (non-ILP)</h2>
        {editingInsurance ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setEditingInsurance(false);
              console.log("[TabMe] insurance edit off");
            }}
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditingInsurance(true);
              console.log("[TabMe] insurance edit on");
            }}
          >
            Edit
          </button>
        )}
      </div>
      <div className="card">
        {editingInsurance ? (
          <>
            {S.insurancePolicies.length === 0 ? (
              <p style={{ color: "var(--muted)", fontStyle: "italic", marginBottom: 12 }}>
                No policies yet. Add term life, PA, CI, or other non-ILP cover.
              </p>
            ) : (
              <>
                <div className="editrow head insurance">
                  <span>Plan</span>
                  <span>Insurer</span>
                  <span>Premium / mo</span>
                  <span>Notes</span>
                  <span></span>
                </div>
                {S.insurancePolicies.map((p, i) => (
                  <div className="editrow insurance" key={i}>
                    <input
                      type="text"
                      value={p.name}
                      placeholder="e.g. ECI"
                      onChange={(e) => updatePolicy(i, { name: e.target.value })}
                    />
                    <input
                      type="text"
                      value={p.insurer}
                      placeholder="Insurer"
                      onChange={(e) => updatePolicy(i, { insurer: e.target.value })}
                    />
                    <NumInput
                      value={p.monthlyPremium}
                      step={0.01}
                      onChange={(v) => updatePolicy(i, { monthlyPremium: v })}
                    />
                    <input
                      type="text"
                      value={p.notes}
                      placeholder="Optional"
                      onChange={(e) => updatePolicy(i, { notes: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn del sm"
                      onClick={() => removePolicy(i)}
                    >
                      del
                    </button>
                  </div>
                ))}
              </>
            )}
            <div className="toolbar">
              <button type="button" className="btn ghost sm" onClick={addPolicy}>
                + Add policy
              </button>
            </div>
          </>
        ) : S.insurancePolicies.length === 0 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            No policies yet. Click <b>Edit</b> to add cover.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Insurer</th>
                  <th>Premium / mo</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {S.insurancePolicies.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name || "—"}</td>
                    <td>{p.insurer || "—"}</td>
                    <td className="num">{fmt2(p.monthlyPremium)}</td>
                    <td>{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="minirow tot" style={{ marginTop: 12 }}>
          <span className="k">Total insurance / mo</span>
          <span className="v">{fmt2(insuranceTotal)}</span>
          {!editingInsurance && (
            <span className="note" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
              Flows to Budget &amp; Savings · click Edit to change
            </span>
          )}
        </div>
      </div>

      <div className="section-head">
        <h2>Savings accounts</h2>
        {editingAccounts ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setEditingAccounts(false);
              console.log("[TabMe] accounts edit off");
            }}
          >
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditingAccounts(true);
              console.log("[TabMe] accounts edit on");
            }}
          >
            Edit
          </button>
        )}
      </div>
      <div className="card">
        {editingAccounts ? (
          <>
            {S.accounts.length === 0 ? (
              <p style={{ color: "var(--muted)", fontStyle: "italic", marginBottom: 12 }}>
                No accounts yet. Add your bank, e-wallet, or cash jars.
              </p>
            ) : (
              <>
                <div className="editrow head accounts">
                  <span>Account</span>
                  <span>Balance</span>
                  <span>Notes</span>
                  <span></span>
                </div>
                {S.accounts.map((a, i) => (
                  <div className="editrow accounts" key={i}>
                    <input
                      type="text"
                      value={a.name}
                      placeholder="e.g. DBS savings"
                      onChange={(e) => updateAccount(i, { name: e.target.value })}
                    />
                    <NumInput
                      value={a.balance}
                      step={0.01}
                      onChange={(v) => updateAccount(i, { balance: v })}
                    />
                    <input
                      type="text"
                      value={a.notes}
                      placeholder="Optional"
                      onChange={(e) => updateAccount(i, { notes: e.target.value })}
                    />
                    <button
                      type="button"
                      className="btn del sm"
                      onClick={() => removeAccount(i)}
                    >
                      del
                    </button>
                  </div>
                ))}
              </>
            )}
            <div className="toolbar">
              <button type="button" className="btn ghost sm" onClick={addAccount}>
                + Add account
              </button>
            </div>
          </>
        ) : S.accounts.length === 0 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            No savings accounts. Click <b>Edit</b> to add balances used for cash and net worth.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Balance</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {S.accounts.map((a, i) => (
                  <tr key={i}>
                    <td>{a.name || "—"}</td>
                    <td className="num">{fmt2(a.balance)}</td>
                    <td>{a.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="minirow tot" style={{ marginTop: 12 }}>
          <span className="k">Total cash</span>
          <span className="v">{fmt2(cashTotal)}</span>
          {!editingAccounts && (
            <span className="note" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
              Used in net worth, cashflow, and projections
            </span>
          )}
        </div>
      </div>

      <h2>Settings</h2>
      <div className="card">
        <p className="note" style={{ marginTop: 0 }}>
          Export or import your full dashboard JSON. Dummy data fills every tab — salary,
          accounts, budget, goals, loans, cards (with catalog rewards), holdings (SGX + US),
          portfolio history, CPF, BTO planner, and more.
        </p>
        <div className="toolbar">
          <button type="button" className="btn" onClick={onApply}>
            Apply &amp; refresh
          </button>
          <button type="button" className="btn ghost" onClick={onSaveNow}>
            Save now
          </button>
          <button type="button" className="btn ghost" onClick={exportJSON}>
            Export JSON
          </button>
          <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <button type="button" className="btn ghost" onClick={loadDummyData}>
            Add dummy data
          </button>
          <button type="button" className="btn del" onClick={onReset}>
            Reset all to zero
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJSON(f);
              e.target.value = "";
            }}
          />
          <span className="save-status">{saveMsg}</span>
        </div>
        {userEmail ? (
          <p className="note" style={{ marginTop: 14, marginBottom: 0 }}>
            Signed in as {userEmail}.{" "}
            <button
              type="button"
              className="btn ghost sm"
              onClick={async () => {
                try {
                  const res = await fetch("/api/auth/signout", {
                    method: "POST",
                    credentials: "include",
                  });
                  if (!res.ok) {
                    console.warn("[TabMe] sign out API failed", res.status);
                  }
                } catch (e) {
                  console.warn("[TabMe] sign out API error", e);
                }
                window.location.href = "/login";
                console.log("[TabMe] signed out");
              }}
            >
              Sign out
            </button>
          </p>
        ) : null}
      </div>
    </section>
  );
}
