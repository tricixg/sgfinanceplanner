"use client";

import { useState } from "react";
import { appConfig } from "@/lib/config";
import { DEFAULTS } from "@/lib/finance/defaults";
import { usePersistedState } from "@/hooks/usePersistedState";
import { TabThisMonth } from "./tabs/TabThisMonth";
import { TabNow } from "./tabs/TabNow";
import { TabCards } from "./tabs/TabCards";
import { TabYear } from "./tabs/TabYear";
import { TabWealth } from "./tabs/TabWealth";
import { TabGoals } from "./tabs/TabGoals";
import { TabBTO } from "./tabs/TabBTO";
import { TabCPF } from "./tabs/TabCPF";
import { TabDebt } from "./tabs/TabDebt";
import { TabEdit } from "./tabs/TabEdit";

const TABS = [
  { id: "thisMonth", label: "This Month" },
  { id: "now", label: "5-Month Cashflow" },
  { id: "cards", label: "Credit Cards" },
  { id: "year", label: "5-Year Projection" },
  { id: "wealth", label: "Wealth & Budget" },
  { id: "goals", label: "Savings Goals" },
  { id: "bto", label: "BTO Planner" },
  { id: "cpf", label: "CPF Outlook" },
  { id: "debt", label: "Debts & Loans" },
  { id: "edit", label: "Edit Inputs" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Dashboard() {
  const [active, setActive] = useState<TabId>("thisMonth");
  const { state, setState, loading, saveMsg, flash, saveNow, reload } =
    usePersistedState();

  const handleReset = () => {
    setState(structuredClone(DEFAULTS));
    saveNow();
    flash("Reset to defaults");
  };

  if (loading) {
    return (
      <div className="wrap">
        <p className="loading">Loading your financial data…</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header>
        <div className="kicker">{appConfig.kicker}</div>
        <h1>{appConfig.title}</h1>
        <div className="sub">{appConfig.subtitle}</div>
        <div className="asof">{appConfig.asOf}</div>
      </header>

      <nav>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${active === t.id ? "on" : ""}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div style={{ display: active === "thisMonth" ? "block" : "none" }}>
        <TabThisMonth state={state} />
      </div>
      <div style={{ display: active === "now" ? "block" : "none" }}>
        <TabNow state={state} setState={setState} />
      </div>
      <div style={{ display: active === "cards" ? "block" : "none" }}>
        <TabCards state={state} setState={setState} />
      </div>
      <div style={{ display: active === "year" ? "block" : "none" }}>
        <TabYear state={state} />
      </div>
      <div style={{ display: active === "wealth" ? "block" : "none" }}>
        <TabWealth state={state} setState={setState} />
      </div>
      <div style={{ display: active === "goals" ? "block" : "none" }}>
        <TabGoals state={state} setState={setState} />
      </div>
      <div style={{ display: active === "bto" ? "block" : "none" }}>
        <TabBTO state={state} />
      </div>
      <div style={{ display: active === "cpf" ? "block" : "none" }}>
        <TabCPF state={state} />
      </div>
      <div style={{ display: active === "debt" ? "block" : "none" }}>
        <TabDebt state={state} />
      </div>
      <div style={{ display: active === "edit" ? "block" : "none" }}>
        <TabEdit
          state={state}
          setState={setState}
          onApply={() => flash("Charts updated")}
          onSaveNow={saveNow}
          onReset={handleReset}
          saveMsg={saveMsg}
        />
      </div>

      <footer>
        Personal planning tool — not financial advice. Data syncs to Supabase when configured;
        otherwise saves to your browser. Project:{" "}
        <a href="https://github.com" style={{ color: "var(--moss)" }}>
          sgfinanceplanner
        </a>
      </footer>
    </div>
  );
}
