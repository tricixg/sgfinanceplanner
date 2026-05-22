"use client";

import { useState } from "react";
import { appConfig } from "@/lib/config";
import { createEmptyState } from "@/lib/finance/defaults";
import { usePersistedState } from "@/hooks/usePersistedState";
import { TabThisMonth } from "./tabs/TabThisMonth";
import { TabNow } from "./tabs/TabNow";
import { TabCards } from "./tabs/TabCards";
import { TabYear } from "./tabs/TabYear";
import { TabWealth } from "./tabs/TabWealth";
import { TabBudgetSavings } from "./tabs/TabBudgetSavings";
import { TabBTO } from "./tabs/TabBTO";
import { TabCPF } from "./tabs/TabCPF";
import { TabDebt } from "./tabs/TabDebt";
import { TabMe } from "./tabs/TabMe";

const TABS = [
  { id: "thisMonth", label: "This Month" },
  { id: "budget", label: "Budget & Savings" },
  { id: "debt", label: "Debts & Loans" },
  { id: "cards", label: "Credit Cards" },
  { id: "wealth", label: "Investment" },
  { id: "cpf", label: "CPF Outlook" },
  { id: "now", label: "5-Month Cashflow" },
  { id: "year", label: "5-Year Projection" },
  { id: "bto", label: "BTO Planner" },
  { id: "me", label: "ME" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Dashboard() {
  const [active, setActive] = useState<TabId>("thisMonth");
  const { state, setState, loading, saveMsg, flash, saveNow, reload } =
    usePersistedState();

  const handleReset = () => {
    setState(createEmptyState());
    saveNow();
    flash("Reset to blank (all zeros)");
    console.info("[dashboard] reset to empty state");
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
      <div style={{ display: active === "budget" ? "block" : "none" }}>
        <TabBudgetSavings state={state} setState={setState} />
      </div>
      <div style={{ display: active === "debt" ? "block" : "none" }}>
        <TabDebt state={state} setState={setState} />
      </div>
      <div style={{ display: active === "cards" ? "block" : "none" }}>
        <TabCards state={state} setState={setState} />
      </div>
      <div style={{ display: active === "wealth" ? "block" : "none" }}>
        <TabWealth state={state} setState={setState} />
      </div>
      <div style={{ display: active === "cpf" ? "block" : "none" }}>
        <TabCPF state={state} setState={setState} />
      </div>
      <div style={{ display: active === "now" ? "block" : "none" }}>
        <TabNow state={state} setState={setState} />
      </div>
      <div style={{ display: active === "year" ? "block" : "none" }}>
        <TabYear state={state} />
      </div>
      <div style={{ display: active === "bto" ? "block" : "none" }}>
        <TabBTO state={state} />
      </div>
      <div style={{ display: active === "me" ? "block" : "none" }}>
        <TabMe
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
