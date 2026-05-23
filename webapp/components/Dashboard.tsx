"use client";

import "@/components/chart-setup";
import { useMemo, useState } from "react";
import { appConfig } from "@/lib/config";
import { createEmptyState } from "@/lib/finance/defaults";
import { usePersistedState } from "@/hooks/usePersistedState";
import { TabThisMonth } from "./tabs/TabThisMonth";
import { TabNow } from "./tabs/TabNow";
import { TabCards } from "./tabs/TabCards";
import { TabYear } from "./tabs/TabYear";
import { TabWealth } from "./tabs/TabWealth";
import { TabBudgetSavings } from "./tabs/TabBudgetSavings";
import { TabSavings } from "./tabs/TabSavings";
import { TabExpenses } from "./tabs/TabExpenses";
import { useSavings } from "@/hooks/useSavings";
import { useAccounts } from "@/hooks/useAccounts";
import { useHousehold } from "@/hooks/useHousehold";
import { mergeSavingsSnapshots } from "@/lib/savings/load-bundle";
import { buildSavingsSnapshot } from "@/lib/finance/savings-totals";
import { localAccountsAsUserSavings, localAccountTotals } from "@/lib/finance/accounts";
import type { SavingsSnapshot } from "@/lib/savings/types";
import { TabBTO } from "./tabs/TabBTO";
import { TabCPF } from "./tabs/TabCPF";
import { TabDebt } from "./tabs/TabDebt";
import { TabMe } from "./tabs/TabMe";

type TabId =
  | "thisMonth"
  | "budget"
  | "savings"
  | "expenses"
  | "debt"
  | "cards"
  | "wealth"
  | "cpf"
  | "now"
  | "year"
  | "bto"
  | "me";

type TabDef = {
  id: TabId;
  label: string;
  summary: string;
};

const NAV_GROUPS: { category: string; tabs: TabDef[] }[] = [
  {
    category: "Overview",
    tabs: [
      {
        id: "thisMonth",
        label: "This Month",
        summary:
          "Net worth breakdown, monthly calendar, and credit card statement totals.",
      },
    ],
  },
  {
    category: "Planning",
    tabs: [
      {
        id: "budget",
        label: "Budget",
        summary:
          "Take-home pay vs budget categories; loans and insurance auto-linked from other tabs.",
      },
      {
        id: "savings",
        label: "Savings & Goals",
        summary:
          "Personal and shared savings accounts, goals, and progress (separate from budget).",
      },
      {
        id: "expenses",
        label: "Expenses",
        summary: "Private expense log — loaded separately, not with the main dashboard.",
      },
      {
        id: "now",
        label: "5-Month Cashflow",
        summary:
          "Five-month income vs fixed spend, loans, insurance, and where surplus goes.",
      },
      {
        id: "year",
        label: "5-Year Projection",
        summary:
          "Wealth growth scenarios using budget, CPF, and investment assumptions.",
      },
      {
        id: "bto",
        label: "BTO Planner",
        summary:
          "Purchase price, grants, loan, downpayment, and cash needed for your flat.",
      },
    ],
  },
  {
    category: "Accounts",
    tabs: [
      {
        id: "debt",
        label: "Debts & Loans",
        summary:
          "Instalment plans and card balances — feeds cashflow, calendar, and burn-down charts.",
      },
      {
        id: "cards",
        label: "Credit Cards",
        summary:
          "Singapore card catalog, rewards snapshot, and spend advisor for which card to use.",
      },
      {
        id: "wealth",
        label: "Investment",
        summary: "Holdings with live prices and P&L, plus Manulife-style ILP policies.",
      },
      {
        id: "cpf",
        label: "CPF Outlook",
        summary:
          "OA, SA, and MediSave balances for BTO planning, net worth, and long-term projections.",
      },
    ],
  },
  {
    category: "Configuration",
    tabs: [
      {
        id: "me",
        label: "ME",
        summary:
          "Salary, savings accounts, non-ILP insurance, and import/export settings.",
      },
    ],
  },
];

const TABS = NAV_GROUPS.flatMap((g) => g.tabs);

type DashboardProps = {
  userId?: string;
  userEmail?: string;
};

export function Dashboard({ userId, userEmail }: DashboardProps = {}) {
  const [active, setActive] = useState<TabId>("thisMonth");
  const [navOpen, setNavOpen] = useState(false);
  const { state, setState, loading, saveMsg, flash, saveNow, reload } =
    usePersistedState(userId);
  const savingsApi = useSavings(Boolean(userId));
  const accountsApi = useAccounts(Boolean(userId));
  const household = useHousehold(Boolean(userId));

  const savingsTotals = useMemo((): SavingsSnapshot | null => {
    if (accountsApi.configured && accountsApi.totals && savingsApi.configured) {
      return mergeSavingsSnapshots(accountsApi.totals, savingsApi.bundle);
    }
    if (accountsApi.configured && accountsApi.totals) {
      const t = accountsApi.totals;
      return {
        personalSavingsCash: t.personalSavingsCash,
        personalNetWorthCash: t.personalNetWorthCash,
        personalCash: t.personalSavingsCash,
        jointCash: 0,
        jointSavingsCash: 0,
        jointNetWorthCash: 0,
        personalMonthlySave: 0,
        jointMonthlySave: 0,
      };
    }
    const accounts = localAccountsAsUserSavings(state);
    const local = localAccountTotals(state);
    if (savingsApi.configured) {
      if (accounts.length > 0) {
        return mergeSavingsSnapshots(local, savingsApi.bundle);
      }
      return savingsApi.bundle.totals;
    }
    if (accounts.length === 0) return null;
    return buildSavingsSnapshot(accounts, [], []);
  }, [accountsApi.configured, accountsApi.totals, savingsApi.configured, savingsApi.bundle, state]);
  const activeTab = TABS.find((t) => t.id === active) ?? TABS[0];

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
    <div className="wrap app-layout">
      {navOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => {
            setNavOpen(false);
            console.log("[dashboard] nav closed via backdrop");
          }}
        />
      ) : null}

      <aside
        className={`sidebar ${navOpen ? "sidebar--open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <div className="kicker">{appConfig.kicker}</div>
          <h1 className="sidebar-title">{appConfig.title}</h1>
          <div className="asof">{appConfig.asOf}</div>
        </div>
        <nav className="sidebar-nav" id="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.category} className="sidebar-group">
              <div className="sidebar-category">{group.category}</div>
              {group.tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tab sidebar-tab ${active === t.id ? "on" : ""}`}
                  onClick={() => {
                    setActive(t.id);
                    setNavOpen(false);
                    console.log("[dashboard] tab", t.id, group.category);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-main-header">
          <button
            type="button"
            className="nav-toggle"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            aria-controls="sidebar-nav"
            onClick={() => {
              setNavOpen((open) => {
                console.log("[dashboard] nav toggle", !open);
                return !open;
              });
            }}
          >
            <span className="nav-toggle-bar" />
            <span className="nav-toggle-bar" />
            <span className="nav-toggle-bar" />
          </button>
          <div className="app-main-header-text">
            <h2 className="app-main-title">{activeTab.label}</h2>
            <p className="sub app-main-summary">{activeTab.summary}</p>
          </div>
        </header>

        <div style={{ display: active === "thisMonth" ? "block" : "none" }}>
          <TabThisMonth
            state={state}
            setState={setState}
            savings={savingsTotals}
          />
        </div>
        <div style={{ display: active === "budget" ? "block" : "none" }}>
          <TabBudgetSavings
            state={state}
            setState={setState}
            savings={savingsTotals}
          />
        </div>
        <div style={{ display: active === "savings" ? "block" : "none" }}>
          <TabSavings
            savings={savingsApi.bundle}
            configured={savingsApi.configured}
            personalAccounts={accountsApi.configured ? accountsApi.accounts : []}
            savePools={savingsApi.savePools}
            saveGoals={savingsApi.saveGoals}
            recordPoolTransaction={savingsApi.recordPoolTransaction}
          />
        </div>
        <div style={{ display: active === "expenses" ? "block" : "none" }}>
          <TabExpenses enabled={Boolean(userId)} />
        </div>
        <div style={{ display: active === "debt" ? "block" : "none" }}>
          <TabDebt state={state} setState={setState} />
        </div>
        <div style={{ display: active === "cards" ? "block" : "none" }}>
          <TabCards state={state} setState={setState} />
        </div>
        <div style={{ display: active === "wealth" ? "block" : "none" }}>
          <TabWealth
            state={state}
            setState={setState}
            savings={savingsTotals}
          />
        </div>
        <div style={{ display: active === "cpf" ? "block" : "none" }}>
          <TabCPF state={state} setState={setState} />
        </div>
        <div style={{ display: active === "now" ? "block" : "none" }}>
          <TabNow
            state={state}
            setState={setState}
            savings={savingsTotals}
          />
        </div>
        <div style={{ display: active === "year" ? "block" : "none" }}>
          <TabYear
            state={state}
            setState={setState}
            savings={savingsTotals}
          />
        </div>
        <div style={{ display: active === "bto" ? "block" : "none" }}>
          <TabBTO state={state} setState={setState} />
        </div>
        <div style={{ display: active === "me" ? "block" : "none" }}>
          <TabMe
            state={state}
            setState={setState}
            onApply={() => flash("Charts updated")}
            onSaveNow={saveNow}
            onReset={handleReset}
            saveMsg={saveMsg}
            userEmail={userEmail}
            household={household}
            accountsApi={
              accountsApi.configured
                ? {
                    accounts: accountsApi.accounts,
                    totals: accountsApi.totals,
                    saveAccounts: accountsApi.saveAccounts,
                    recordAccountTransaction: accountsApi.recordAccountTransaction,
                    reload: accountsApi.reload,
                  }
                : undefined
            }
            savingsGoals={
              savingsApi.configured ? savingsApi.bundle.goals : undefined
            }
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
    </div>
  );
}
