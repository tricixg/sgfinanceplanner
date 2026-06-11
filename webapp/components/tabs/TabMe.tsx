"use client";

import { useContext, useEffect, useRef, useState } from "react";
import type { DashboardState, InsurancePolicy } from "@/lib/types";
import { AppDataContext } from "@/contexts/app-data-contexts";
import {
  computedInsuranceMonthly,
  defaultInsurancePolicy,
} from "@/lib/finance";
import { createDummyState, mergeWithDefaults } from "@/lib/finance/defaults";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import { PartnerCard } from "@/components/PartnerCard";
import { TelegramLinkCard } from "@/components/integrations/TelegramLinkCard";
import { RecurringScheduleFields } from "@/components/recurring/RecurringScheduleFields";
import type { useHousehold } from "@/hooks/useHousehold";
import { DecimalInput } from "@/components/DecimalInput";

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
  onSaveError?: (message: string) => void;
};

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
  onSaveError,
}: Props) {
  const appData = useContext(AppDataContext);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingInsurance, setEditingInsurance] = useState(false);
  const [savingInsurance, setSavingInsurance] = useState(false);
  const [insuranceDraft, setInsuranceDraft] = useState(S.insurancePolicies);
  const [signingOut, setSigningOut] = useState(false);
  const [editingSalary, setEditingSalary] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [salaryDraft, setSalaryDraft] = useState({
    monthlySal: S.monthlySal,
    comms: S.comms,
    salaryCreditDay: S.salaryCreditDay,
  });
  const insurancePolicies = editingInsurance ? insuranceDraft : S.insurancePolicies;
  const insuranceTotal = computedInsuranceMonthly({
    ...S,
    insurancePolicies,
  });

  useEffect(() => {
    if (!editingSalary) {
      setSalaryDraft({
        monthlySal: S.monthlySal,
        comms: S.comms,
        salaryCreditDay: S.salaryCreditDay,
      });
    }
  }, [S.monthlySal, S.comms, S.salaryCreditDay, editingSalary]);

  const startSalaryEdit = () => {
    setSalaryDraft({
      monthlySal: S.monthlySal,
      comms: S.comms,
      salaryCreditDay: S.salaryCreditDay,
    });
    setEditingSalary(true);
    console.info("[TabMe] salary edit on");
  };

  const cancelSalaryEdit = () => {
    setSalaryDraft({
      monthlySal: S.monthlySal,
      comms: S.comms,
      salaryCreditDay: S.salaryCreditDay,
    });
    setEditingSalary(false);
    console.info("[TabMe] salary edit cancelled");
  };

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
    console.info("[TabMe] patched", key, val);
  };

  const saveSalary = async () => {
    setSavingSalary(true);
    try {
      if (appData?.configured) {
        await appData.saveProfile({
        monthlySal: salaryDraft.monthlySal,
        comms: salaryDraft.comms,
        salaryCreditDay: salaryDraft.salaryCreditDay,
        });
        console.info("[TabMe] salary saved to profile", salaryDraft);
      } else {
        setState((prev) => ({ ...prev, ...salaryDraft }));
        console.info("[TabMe] salary saved to local state", salaryDraft);
      }
      setEditingSalary(false);
      onSaveNow();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save salary";
      console.error("[TabMe] salary save failed", e);
      onSaveError?.(msg);
    } finally {
      setSavingSalary(false);
    }
  };

  const startInsuranceEdit = () => {
    setInsuranceDraft(structuredClone(S.insurancePolicies));
    setEditingInsurance(true);
    console.info("[TabMe] insurance edit on");
  };

  const saveInsurance = async () => {
    setSavingInsurance(true);
    try {
      if (appData?.configured) {
        await appData.saveProfilePolicies({ insurancePolicies: insuranceDraft });
      } else {
        setState((prev) => ({ ...prev, insurancePolicies: insuranceDraft }));
      }
      setEditingInsurance(false);
      console.info("[TabMe] insurance saved", { count: insuranceDraft.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save insurance";
      onSaveError?.(msg);
      console.error("[TabMe] insurance save failed", e);
    } finally {
      setSavingInsurance(false);
    }
  };

  const updatePolicy = (i: number, patchPolicy: Partial<InsurancePolicy>) => {
    setInsuranceDraft((prev) =>
      prev.map((p, j) => (j === i ? { ...p, ...patchPolicy } : p))
    );
    console.info("[TabMe] updated insurance draft", i, patchPolicy);
  };

  const addPolicy = () => {
    setInsuranceDraft((prev) => [...prev, defaultInsurancePolicy()]);
    console.info("[TabMe] added insurance policy to draft");
  };

  const removePolicy = (i: number) => {
    setInsuranceDraft((prev) => prev.filter((_, j) => j !== i));
    console.info("[TabMe] removed insurance policy from draft", i);
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
      console.info("[TabMe] add dummy data cancelled");
      return;
    }
    setState(createDummyState());
    onSaveNow();
    onApply();
    console.info("[TabMe] loaded dummy data");
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
        <b>CPF Outlook</b>; ILP is on <b>Investment</b>. Click <b>Edit</b> on Salary to change
        take-home inputs; insurance auto-saves when edited.
      </div>

      <div className="section-head">
        <h2>Salary</h2>
        {editingSalary ? (
          <>
            <button
              type="button"
              className="btn ghost sm"
              disabled={savingSalary}
              onClick={cancelSalaryEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn sm"
              disabled={savingSalary}
              onClick={() => void saveSalary()}
            >
              {savingSalary ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startSalaryEdit}>
            Edit
          </button>
        )}
      </div>
      <div className="card">
        {editingSalary ? (
          <>
            <div className="editrow head">
              <span>Item</span>
              <span>Amount</span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="editrow">
              <span>Monthly gross salary</span>
              <DecimalInput
                value={salaryDraft.monthlySal}
                onChange={(v) => setSalaryDraft((d) => ({ ...d, monthlySal: v }))}
              />
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="editrow">
              <span>Comms allowance / mo (non-CPF)</span>
              <DecimalInput
                value={salaryDraft.comms}
                onChange={(v) => setSalaryDraft((d) => ({ ...d, comms: v }))}
              />
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="editrow">
              <span>Salary credit day (1–31)</span>
              <DecimalInput
                value={salaryDraft.salaryCreditDay}
                onChange={(v) =>
                  setSalaryDraft((d) => ({
                    ...d,
                    salaryCreditDay: Math.min(31, Math.max(1, Math.round(v))),
                  }))
                }
              />
              <span className="note" style={{ gridColumn: "2 / -1" }}>
                Shorter months use the last day (e.g. 31 → 30 in Apr, 28/29 in Feb).
              </span>
              <span></span>
              <span></span>
            </div>
          </>
        ) : (
          <>
            <div className="minirow">
              <span className="k">Monthly gross salary</span>
              <span className="v">{fmt2(S.monthlySal)}</span>
            </div>
            <div className="minirow">
              <span className="k">Comms allowance / mo (non-CPF)</span>
              <span className="v">{fmt2(S.comms)}</span>
            </div>
            <div className="minirow">
              <span className="k">Salary credit day</span>
              <span className="v">{S.salaryCreditDay || "—"}</span>
            </div>
            <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>
              Feeds cashflow and budget take-home · click Edit to change
            </p>
          </>
        )}
      </div>

      <div className="section-head">
        <h2>Insurance (non-ILP)</h2>
        {editingInsurance ? (
          <button
            type="button"
            className="btn sm"
            disabled={savingInsurance}
            onClick={() => void saveInsurance()}
          >
            {savingInsurance ? "Saving…" : "Save"}
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startInsuranceEdit}>
            Edit
          </button>
        )}
      </div>
      <div className="card">
        {editingInsurance ? (
          <>
            {insurancePolicies.length === 0 ? (
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
                {insurancePolicies.map((p, i) => (
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
                    <DecimalInput
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
      <TelegramLinkCard />
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
