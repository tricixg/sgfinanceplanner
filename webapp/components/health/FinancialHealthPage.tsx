"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NetWorthTrendChart } from "@/components/health/NetWorthTrendChart";
import { CardHeader } from "@/components/ui/CardHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, Skeleton, SkeletonLines } from "@/components/ui/States";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useAppData } from "@/hooks/useAppData";
import { useCardStatements } from "@/hooks/useCardStatements";
import { useCashflowAnalytics } from "@/hooks/useCashflowAnalytics";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import { useOutstandingCardStatements } from "@/hooks/useOutstandingCardStatements";
import { usePageSavings } from "@/hooks/usePageSavings";
import { monthYear, shortMonth, summariseFlows } from "@/lib/dashboard/cashflow";
import {
  STATUS_LABEL,
  commitmentStatus,
  debtServiceStatus,
  goalProgress,
  netWorthChange,
  netWorthSeries,
  ratio,
  runwayMonths,
  runwayStatus,
  savingsRateStatus,
  type HealthStatus,
} from "@/lib/dashboard/health";
import { fetchJson } from "@/lib/fetch-json";
import { computedDebtMonthly, netWorthSlices, stableTakeHome, wealthSummary } from "@/lib/finance";
import { addMonthsYm } from "@/lib/finance/calendar";
import { fmt, fmt2 } from "@/lib/finance/helpers";
import type { RecurringRow } from "@/lib/recurring/build-rows";
import { sgtTodayYmd } from "@/lib/time/sgt";
import type { DashboardState } from "@/lib/types";

type Props = {
  state: DashboardState;
};

const CPF_OPTIONS = [
  { value: "excl", label: "Excl. CPF" },
  { value: "incl", label: "Incl. CPF" },
] as const;

const KIND_LABEL: Record<string, string> = {
  debt: "Loan",
  insurance: "Insurance",
  ilp: "ILP",
  subscription: "Subscription",
  invest: "Investment",
  bnpl: "Instalment",
  card: "Card bill",
};

const pct = (r: number) => `${Math.round(r * 100)}%`;

function StatusPill({ status }: { status: HealthStatus }) {
  return <span className={`status-pill ${status}`}>{STATUS_LABEL[status]}</span>;
}

function dueLabel(ymd: string): string {
  return `${Number(ymd.slice(8, 10))} ${shortMonth(ymd.slice(0, 7))}`;
}

export function FinancialHealthPage({ state: S }: Props) {
  const user = useAppSession();
  const enabled = Boolean(user?.id);
  const [cpfMode, setCpfMode] = useState<"excl" | "incl">("excl");
  const includeCpf = cpfMode === "incl";

  const todayYmd = sgtTodayYmd();
  const currentYm = todayYmd.slice(0, 7);

  const { savingsTotals, savingsApi } = usePageSavings(user?.id, S);
  const { netWorthHistory } = useAppData();
  const { bundle: cardBundle } = useCardStatements(enabled);
  const { statements: outstandingStatements } = useOutstandingCardStatements();

  // Same definition as Cash Accounts: personal position only, joint pools excluded.
  const personalSavings = useMemo(
    () =>
      savingsTotals
        ? {
            ...savingsTotals,
            jointCash: 0,
            jointNetWorthCash: 0,
            jointSavingsCash: 0,
            jointMonthlySave: 0,
          }
        : null,
    [savingsTotals]
  );
  const wealth = useMemo(
    () => wealthSummary(S, personalSavings, cardBundle.openCycles),
    [S, personalSavings, cardBundle.openCycles]
  );
  const netWorth = wealth.lnw + (includeCpf ? wealth.cpf : 0);
  const assetSlices = useMemo(
    () => netWorthSlices(S, includeCpf, personalSavings),
    [S, includeCpf, personalSavings]
  );
  const assetsTotal = assetSlices.reduce((s, a) => s + a.value, 0);
  const liabilities = wealth.liabLines.filter((l) => l.amount > 0);

  // Month-end snapshots, with today's live figure standing in for the current month.
  const trendPoints = useMemo(() => {
    const past = netWorthSeries(netWorthHistory, includeCpf).filter((p) => p.month < currentYm);
    return [...past, { month: currentYm, value: netWorth }];
  }, [netWorthHistory, includeCpf, currentYm, netWorth]);
  const changeMonth = netWorthChange(trendPoints, netWorth, currentYm, 1);
  const changeYear = netWorthChange(trendPoints, netWorth, currentYm, 12);

  // Last three complete months give a steadier baseline than a month in progress.
  const baselineMonths = useMemo(
    () => [3, 2, 1].map((n) => addMonthsYm(currentYm, -n)),
    [currentYm]
  );
  const { flows, loading: flowsLoading } = useCashflowAnalytics(
    enabled,
    currentYm,
    baselineMonths[0]!
  );
  const baseline = useMemo(() => summariseFlows(flows, baselineMonths), [flows, baselineMonths]);
  const avgSpending = baseline.activeMonths > 0 ? baseline.spending / baseline.activeMonths : 0;
  const baselineLabel = `${shortMonth(baselineMonths[0]!)}–${shortMonth(baselineMonths[2]!)}`;

  const [recurring, setRecurring] = useState<RecurringRow[] | null>(null);
  const loadRecurring = useCallback(async () => {
    if (!enabled) return;
    try {
      const { res, data } = await fetchJson<{ rows?: RecurringRow[]; error?: string }>(
        `/api/recurring?ym=${currentYm}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to load recurring payments");
      setRecurring(data.rows ?? []);
    } catch (e) {
      console.error("[FinancialHealthPage] recurring load failed", e);
      setRecurring([]);
    }
  }, [enabled, currentYm]);
  useEffect(() => {
    void loadRecurring();
  }, [loadRecurring]);
  useDomainEvent(["recurring:changed", "expense:changed", "loans:changed"], () => void loadRecurring());

  const takeHome = stableTakeHome(S);
  const debtMonthly = computedDebtMonthly(S, currentYm);
  // Obligations only — recurring investments are saving, not a cost.
  const commitmentRows = (recurring ?? []).filter((r) => r.kind !== "invest");
  const commitmentsMonthly = commitmentRows.reduce((s, r) => s + r.amount, 0);

  const runway = runwayMonths(wealth.cash, avgSpending);
  const debtRatio = ratio(debtMonthly, takeHome);
  const commitmentRatio = ratio(commitmentsMonthly, takeHome);

  const upcoming = useMemo(() => {
    const items: { key: string; name: string; kind: string; due: string | null; amount: number }[] =
      [];
    for (const r of recurring ?? []) {
      if (r.paid) continue;
      items.push({
        key: `${r.kind}:${r.sourceId}`,
        name: r.name,
        kind: r.kind,
        due: r.deductionDay ? r.suggestedSpentAt : null,
        amount: r.amount,
      });
    }
    for (const s of outstandingStatements) {
      if (!(s.outstandingBalance > 0)) continue;
      items.push({
        key: `card:${s.id}`,
        name: s.cardName,
        kind: "card",
        due: s.paymentDueDate,
        amount: s.outstandingBalance,
      });
    }
    return items.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  }, [recurring, outstandingStatements]);
  const upcomingTotal = upcoming.reduce((s, u) => s + u.amount, 0);

  const goals = useMemo(
    () =>
      (savingsApi.configured ? savingsApi.bundle.goals : [])
        .filter((g) => g.targetAmount > 0)
        .map((g) => goalProgress(g, currentYm)),
    [savingsApi.configured, savingsApi.bundle.goals, currentYm]
  );
  const goalsSaved = goals.reduce((s, g) => s + g.saved, 0);
  const goalsTarget = goals.reduce((s, g) => s + g.target, 0);

  if (!enabled) {
    return (
      <section className="panel on">
        <div className="card">
          <EmptyState icon="pulse" title="Sign in to see your financial health">
            Net worth, resilience and goal progress appear here once you’re signed in.
          </EmptyState>
        </div>
      </section>
    );
  }

  const tiles: {
    key: string;
    label: string;
    href: string;
    value: React.ReactNode;
    status: HealthStatus;
    note: string;
    loading?: boolean;
  }[] = [
    {
      key: "runway",
      label: "Emergency runway",
      href: "/cash-accounts",
      loading: flowsLoading,
      status: runwayStatus(runway),
      value:
        runway == null ? (
          "—"
        ) : (
          <>
            {runway >= 24 ? "24+" : runway.toFixed(1)} <small>months</small>
          </>
        ),
      note:
        runway == null
          ? "Needs at least one full month of recorded spending."
          : `${fmt(wealth.cash)} cash ÷ ${fmt(avgSpending)}/mo average spending (${baselineLabel}).`,
    },
    {
      key: "savings",
      label: "Savings rate",
      href: "/past-cashflow",
      loading: flowsLoading,
      status: savingsRateStatus(baseline.savingsRate),
      value: baseline.savingsRate == null ? "—" : pct(baseline.savingsRate),
      note:
        baseline.savingsRate == null
          ? `No income recorded for ${baselineLabel}.`
          : `Kept ${fmt(baseline.net)} of ${fmt(baseline.income)} income over ${baselineLabel}.`,
    },
    {
      key: "debt",
      label: "Debt repayments",
      href: "/debt",
      status: debtServiceStatus(debtRatio),
      value:
        debtRatio == null ? (
          "—"
        ) : (
          <>
            {pct(debtRatio)} <small>of take-home</small>
          </>
        ),
      note:
        debtRatio == null
          ? "Add your salary under Me to compare against take-home pay."
          : `${fmt(debtMonthly)}/mo in instalments against ${fmt(takeHome)} take-home.`,
    },
    {
      key: "commitments",
      label: "Recurring commitments",
      href: "/recurring",
      loading: recurring == null,
      status: commitmentStatus(commitmentRatio),
      value:
        commitmentRatio == null ? (
          "—"
        ) : (
          <>
            {pct(commitmentRatio)} <small>of take-home</small>
          </>
        ),
      note:
        commitmentRatio == null
          ? "Add your salary under Me to compare against take-home pay."
          : `${fmt(commitmentsMonthly)}/mo across ${commitmentRows.length} loans, policies, subscriptions and instalments.`,
    },
  ];

  return (
    <section className="panel on dash">
      {/* Net worth — the headline position. */}
      <div className="card hero">
        <div>
          <div className="hero-label">Net worth</div>
          <div className={`hero-value ${netWorth < 0 ? "neg" : ""}`}>{fmt(netWorth)}</div>
          <div className="hero-meta">
            {changeMonth ? (
              <>
                <span className={`delta ${changeMonth.amount >= 0 ? "good" : "bad"}`}>
                  {changeMonth.amount >= 0 ? "+" : "-"}
                  {fmt(Math.abs(changeMonth.amount))}
                </span>
                <span>since {monthYear(changeMonth.sinceYm)}</span>
              </>
            ) : (
              <span>History builds as month-end snapshots are recorded.</span>
            )}
            {changeYear && changeYear.sinceYm !== changeMonth?.sinceYm ? (
              <>
                <span aria-hidden="true">·</span>
                <span className={`delta ${changeYear.amount >= 0 ? "good" : "bad"}`}>
                  {changeYear.amount >= 0 ? "+" : "-"}
                  {fmt(Math.abs(changeYear.amount))}
                </span>
                <span>in 12 months</span>
              </>
            ) : null}
          </div>
          <div style={{ marginTop: 16 }}>
            <SegmentedControl
              options={[...CPF_OPTIONS]}
              value={cpfMode}
              onChange={setCpfMode}
              label="Include CPF in net worth"
            />
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          {trendPoints.length >= 2 ? (
            <NetWorthTrendChart points={trendPoints} />
          ) : (
            <EmptyState icon="trend" title="No history yet">
              Open Cash Accounts each month to record a snapshot and build this trend.
            </EmptyState>
          )}
        </div>
      </div>

      {/* Resilience indicators. */}
      <div className="grid g4">
        {tiles.map((t) => (
          <Link key={t.key} href={t.href} className="card health-tile">
            <div className="health-tile-top">
              <span>{t.label}</span>
              {t.loading ? null : <StatusPill status={t.status} />}
            </div>
            <div className="health-tile-value">
              {t.loading ? <Skeleton width={90} height={26} /> : t.value}
            </div>
            <div className="health-tile-note">
              {t.loading ? <Skeleton width="85%" /> : t.note}
            </div>
          </Link>
        ))}
      </div>

      <div className="dash-grid">
        {/* What you own. */}
        <div className="card span-7">
          <CardHeader
            title="Assets"
            subtitle={`${fmt(assetsTotal)} ${includeCpf ? "including" : "excluding"} CPF`}
            href="/cash-accounts"
            linkLabel="Accounts"
          />
          {assetSlices.length === 0 ? (
            <EmptyState
              icon="bank"
              title="No assets recorded"
              action={
                <Link href="/cash-accounts" className="link-more">
                  Add an account
                </Link>
              }
            >
              Add cash accounts or holdings to see how your money is allocated.
            </EmptyState>
          ) : (
            <>
              <div className="alloc-bar" role="img" aria-label="Asset allocation">
                {assetSlices.map((a) => (
                  <i
                    key={a.label}
                    style={{ width: `${(a.value / assetsTotal) * 100}%`, background: a.color }}
                  />
                ))}
              </div>
              <div className="list" style={{ marginTop: 8 }}>
                {assetSlices.map((a) => (
                  <div className="list-row" key={a.label} style={{ minHeight: 44 }}>
                    <span className="dot" style={{ background: a.color }} />
                    <div className="list-row-main">
                      <div className="list-row-title">{a.label}</div>
                    </div>
                    <div className="list-row-end rank-val">
                      {fmt(a.value)}
                      <small>{pct(a.value / assetsTotal)}</small>
                    </div>
                  </div>
                ))}
              </div>
              {!includeCpf && wealth.cpf > 0 ? (
                <p className="card-sub" style={{ marginTop: 8 }}>
                  CPF balances of {fmt(wealth.cpf)} are not counted here.
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* What you owe. */}
        <div className="card span-5">
          <CardHeader
            title="Liabilities"
            subtitle={`${fmt(wealth.liab)} owed`}
            href="/debt"
            linkLabel="Debts"
          />
          {liabilities.length === 0 ? (
            <EmptyState icon="check" title="Nothing owed">
              No loans or card balances are outstanding.
            </EmptyState>
          ) : (
            <div className="list">
              {liabilities.map((l) => (
                <div className="list-row" key={l.key} style={{ minHeight: 44 }}>
                  <div className="list-row-main">
                    <div className="list-row-title">{l.label}</div>
                    <div style={{ marginTop: 6 }}>
                      <ProgressBar
                        value={wealth.liab > 0 ? l.amount / wealth.liab : 0}
                        tone="over"
                        size="sm"
                        label={`${l.label} share of liabilities`}
                      />
                    </div>
                  </div>
                  <div className="list-row-end list-row-amount">{fmt(l.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Progress towards goals. */}
        <div className="card span-6">
          <CardHeader
            title="Savings goals"
            subtitle={
              goals.length > 0 ? `${fmt(goalsSaved)} of ${fmt(goalsTarget)} saved` : undefined
            }
            href="/savings"
            linkLabel="Goals"
          />
          {savingsApi.loading && !savingsApi.hasLoaded ? (
            <SkeletonLines lines={5} label="Loading goals" />
          ) : goals.length === 0 ? (
            <EmptyState
              icon="target"
              title="No goals yet"
              action={
                <Link href="/savings" className="link-more">
                  Create a goal
                </Link>
              }
            >
              Set a target and date to track progress here.
            </EmptyState>
          ) : (
            <div className="list">
              {goals.slice(0, 5).map((g) => (
                <div className="list-row" key={g.id} style={{ minHeight: 0, padding: "12px 0" }}>
                  <div className="list-row-main">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 7,
                      }}
                    >
                      <span className="list-row-title">{g.name}</span>
                      {g.notStarted && g.startYm ? (
                        <span className="status-pill neutral">Starts {monthYear(g.startYm)}</span>
                      ) : g.onTrack == null ? null : (
                        <span className={`status-pill ${g.onTrack ? "good" : "watch"}`}>
                          {g.progress >= 1 ? "Reached" : g.onTrack ? "On track" : "Behind"}
                        </span>
                      )}
                    </div>
                    <ProgressBar value={g.progress} size="sm" label={`${g.name} progress`} />
                    <div
                      className="card-sub"
                      style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6 }}
                    >
                      <span>
                        {fmt(g.saved)} of {fmt(g.target)}
                      </span>
                      <span>
                        {g.progress >= 1
                          ? "Complete"
                          : g.monthlyContribution > 0 && g.targetYm
                            ? `${fmt(g.monthlyContribution)}/mo to ${monthYear(g.targetYm)}`
                            : g.neededPerMonth != null && g.targetYm
                            ? `${fmt(g.neededPerMonth)}/mo to ${monthYear(g.targetYm)}`
                            : g.targetYm
                              ? `Due ${monthYear(g.targetYm)}`
                              : `${pct(g.progress)}`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* What still has to be paid this month. */}
        <div className="card span-6">
          <CardHeader
            title="Still to pay this month"
            subtitle={
              upcoming.length > 0
                ? `${fmt2(upcomingTotal)} across ${upcoming.length} ${upcoming.length === 1 ? "item" : "items"}`
                : undefined
            }
            href="/recurring"
            linkLabel="Recurring"
          />
          {recurring == null ? (
            <SkeletonLines lines={5} label="Loading commitments" />
          ) : upcoming.length === 0 ? (
            <EmptyState icon="check" title="All settled">
              Every recurring payment and card bill for {monthYear(currentYm)} is marked paid.
            </EmptyState>
          ) : (
            <div className="list">
              {upcoming.slice(0, 6).map((u) => (
                <div className="list-row" key={u.key}>
                  <div className="list-row-main">
                    <div className="list-row-title">{u.name}</div>
                    <div className="list-row-sub">
                      {KIND_LABEL[u.kind] ?? u.kind}
                      {u.due ? ` · due ${dueLabel(u.due)}` : ""}
                    </div>
                  </div>
                  <div className="list-row-end list-row-amount">{fmt2(u.amount)}</div>
                </div>
              ))}
              {upcoming.length > 6 ? (
                <p className="card-sub" style={{ paddingTop: 10 }}>
                  + {upcoming.length - 6} more on Recurring and Credit Cards
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <p className="card-sub">
        Status labels use common rules of thumb (6 months of expenses in cash, a 20% savings
        rate, debt repayments under 20% of take-home). They are a guide, not financial advice.
      </p>
    </section>
  );
}
