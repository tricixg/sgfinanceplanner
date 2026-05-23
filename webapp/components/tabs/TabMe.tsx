"use client";

import { useRef, useState } from "react";
import type { DashboardState, InsurancePolicy } from "@/lib/types";
import {
  computedInsuranceMonthly,
  defaultInsurancePolicy,
} from "@/lib/finance";
import { createDummyState, mergeWithDefaults } from "@/lib/finance/defaults";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { PartnerCard } from "@/components/PartnerCard";
import { RecurringScheduleFields } from "@/components/recurring/RecurringScheduleFields";
import type { useHousehold } from "@/hooks/useHousehold";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  onApply: () => void;
  onSaveNow: () => void;
  onReset: () => void;
  saveMsg: string;
  userEmail?: string;
  household?: ReturnType<typeof useHousehold>;
  onPartnerUnlinked?: () => void | Promise<void>;
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
  household,
  onPartnerUnlinked,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingInsurance, setEditingInsurance] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const insuranceTotal = computedInsuranceMonthly(S);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      const res = await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        console.warn("[TabMe] sign out API failed", res.status);
      } else {
        console.info("[TabMe] signed out");
      }
    } catch (e) {
      console.warn("[TabMe] sign out API error", e);
    } finally {
      window.location.href = "/login";
    }
  };

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
        Your salary and non-ILP insurance live here. When signed in, savings balances are on{" "}
        <b>Savings &amp; Goals</b>; legacy accounts below still apply if you use browser-only mode.
        Insurance premiums total <b>{fmt(insuranceTotal)}/mo</b> and flow to <b>Budget</b>. CPF is on{" "}
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
                  <span>Due</span>
                  <span>Pay from</span>
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
                    <RecurringScheduleFields
                      inline
                      deductionDay={p.deductionDay}
                      defaultFinancialAccountId={p.defaultFinancialAccountId}
                      onDeductionDayChange={(day) => updatePolicy(i, { deductionDay: day })}
                      onAccountChange={(id) =>
                        updatePolicy(i, { defaultFinancialAccountId: id })
                      }
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

      <h2>Settings</h2>
      {household ? (
        <PartnerCard household={household} onPartnerUnlinked={onPartnerUnlinked} />
      ) : null}
      {userEmail ? (
        <div className="card settings-account">
          <h3 className="settings-account-title">Account</h3>
          <p className="note" style={{ marginTop: 0, marginBottom: 12 }}>
            Signed in as <strong>{userEmail}</strong>. Your dashboard syncs to the cloud
            while you are signed in.
          </p>
          <button
            type="button"
            className="btn ghost"
            disabled={signingOut}
            onClick={handleLogout}
          >
            {signingOut ? "Signing out…" : "Log out"}
          </button>
        </div>
      ) : null}
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
      </div>
    </section>
  );
}
