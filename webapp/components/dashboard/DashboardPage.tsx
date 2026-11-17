"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CashflowTrendChart } from "@/components/dashboard/CashflowTrendChart";
import { BudgetCard } from "@/components/dashboard/BudgetCard";
import { RecentActivityCard } from "@/components/dashboard/RecentActivityCard";
import { CardHeader } from "@/components/ui/CardHeader";
import { Delta } from "@/components/ui/Delta";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, ErrorState, Skeleton, SkeletonLines } from "@/components/ui/States";
import { colorAt } from "@/components/spending/chart-colors";
import { useAppData } from "@/hooks/useAppData";
import { useCashflowAnalytics } from "@/hooks/useCashflowAnalytics";
import {
  RANGE_OPTIONS,
  monthElapsed,
  pctChange,
  periodLabel,
  priorLabel,
  rangeWindow,
  summariseFlows,
  topWithOther,
  trendMonths,
  type RangeKey,
} from "@/lib/dashboard/cashflow";
import { effectiveCalendarDay, fmt, fmtSigned2 } from "@/lib/finance/helpers";
import { sgtTodayYmd } from "@/lib/time/sgt";

type Props = {
  enabled: boolean;
};

const RANGE_STORAGE_KEY = "dashboard:range";
const SEGMENTS = RANGE_OPTIONS.map((o) => ({ value: o.key, label: o.short, compact: o.compact }));

function readStoredRange(): RangeKey {
  try {
    const raw = window.localStorage.getItem(RANGE_STORAGE_KEY);
    if (raw && RANGE_OPTIONS.some((o) => o.key === raw)) return raw as RangeKey;
  } catch {
    // Storage can be unavailable (private mode); the default range is fine.
  }
  return "this-month";
}

const signedWhole = (n: number) => `${n < 0 ? "-" : ""}${fmt(Math.abs(n))}`;

export function DashboardPage({ enabled }: Props) {
  const [range, setRange] = useState<RangeKey>("this-month");
  useEffect(() => {
    setRange(readStoredRange());
  }, []);

  const chooseRange = useCallback((next: RangeKey) => {
    setRange(next);
    try {
      window.localStorage.setItem(RANGE_STORAGE_KEY, next);
    } catch {
      // Non-critical preference.
    }
    console.info("[DashboardPage] range", next);
  }, []);

  const { state: profile } = useAppData();
  // Fixed for the life of the page so every derived period uses the same "today".
  const [todayYmd] = useState(() => sgtTodayYmd());
  const currentYm = todayYmd.slice(0, 7);
  const window_ = useMemo(() => rangeWindow(range, currentYm), [range, currentYm]);
  const plotMonths = useMemo(() => trendMonths(window_, currentYm), [window_, currentYm]);
  const earliestYm = window_.prior[0]! < plotMonths[0]! ? window_.prior[0]! : plotMonths[0]!;

  const { flows, loading, pending, error, reload } = useCashflowAnalytics(
    enabled,
    currentYm,
    earliestYm
  );

  const current = useMemo(() => summariseFlows(flows, window_.months), [flows, window_]);
  const previous = useMemo(() => summariseFlows(flows, window_.prior), [flows, window_]);
  const categories = useMemo(
    () => topWithOther(current.spendingByCategory, 6),
    [current.spendingByCategory]
  );

  if (!enabled) {
    return (
      <section className="panel on">
        <div className="card">
          <EmptyState icon="home" title="Sign in to see your dashboard">
            Your income, spending and cash flow appear here once you’re signed in.
          </EmptyState>
        </div>
      </section>
    );
  }

  const busy = loading || pending;
  const isThisMonth = range === "this-month";
  const compareTo = priorLabel(window_);
  const hasActivity = current.income > 0 || current.spending > 0;
  const flowTotal = current.income + current.spending;
  const netDiff = current.net - previous.net;
  const rateDiffPts =
    current.savingsRate != null && previous.savingsRate != null
      ? (current.savingsRate - previous.savingsRate) * 100
      : null;
  const dayOfMonth = Number(todayYmd.slice(8, 10));
  const daysInMonth = Math.round(dayOfMonth / monthElapsed(todayYmd));
  // Mid-month the picture is lopsided until pay arrives; say so rather than alarm.
  const salaryDay =
    profile.monthlySal > 0 ? effectiveCalendarDay(profile.salaryCreditDay, currentYm) : null;
  const awaitingSalary =
    isThisMonth && current.income === 0 && salaryDay != null && salaryDay > dayOfMonth;

  return (
    <section className="panel on dash">
      <div className="dash-toolbar">
        <SegmentedControl
          options={SEGMENTS}
          value={range}
          onChange={chooseRange}
          label="Date range"
          fill
        />
        <span className="dash-period">{periodLabel(window_, todayYmd)}</span>
      </div>

      {error && flows.size === 0 ? (
        <div className="card">
          <ErrorState message={error} onRetry={() => void reload()} />
        </div>
      ) : (
        <>
          {/* 1 — How much came in, went out, and what's left. */}
          <div className="card hero" aria-busy={busy}>
            <div>
              <div className="hero-label">Net cash flow</div>
              {busy ? (
                <div style={{ marginTop: 8 }}>
                  <Skeleton width={190} height={42} radius={10} />
                </div>
              ) : (
                <div className={`hero-value ${current.net < 0 ? "neg" : ""}`}>
                  {fmtSigned2(current.net)}
                </div>
              )}
              <div className="hero-meta">
                {busy ? (
                  <Skeleton width={150} />
                ) : !hasActivity ? (
                  <span>No income or spending recorded for this period yet.</span>
                ) : isThisMonth ? (
                  <span>
                    Day {dayOfMonth} of {daysInMonth} ·{" "}
                    {awaitingSalary
                      ? `salary usually lands on day ${salaryDay}`
                      : `${compareTo} ended at ${signedWhole(previous.net)}`}
                  </span>
                ) : (
                  <>
                    <span className={`delta ${netDiff >= 0 ? "good" : "bad"}`}>
                      {netDiff >= 0 ? "+" : "-"}
                      {fmt(Math.abs(netDiff))}
                    </span>
                    <span>vs {compareTo}</span>
                  </>
                )}
              </div>
              {hasActivity && !busy ? (
                <div
                  className="hero-split"
                  role="img"
                  aria-label={`Income ${fmt(current.income)}, spending ${fmt(current.spending)}`}
                >
                  {current.income > 0 ? (
                    <i
                      className="k-in"
                      style={{ width: `${(current.income / flowTotal) * 100}%` }}
                    />
                  ) : null}
                  {current.spending > 0 ? (
                    <i
                      className="k-out"
                      style={{ width: `${(current.spending / flowTotal) * 100}%` }}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="hero-metrics">
              <Link href="/past-cashflow" className="metric">
                <div className="metric-label">
                  <span className="dot" style={{ background: "var(--moss)" }} />
                  Income
                </div>
                <div className="metric-value">
                  {busy ? <Skeleton width="80%" height={22} /> : fmt(current.income)}
                </div>
                <div className="metric-foot">
                  {busy ? null : isThisMonth ? (
                    `${compareTo}: ${fmt(previous.income)}`
                  ) : (
                    <Delta pct={pctChange(current.income, previous.income)} suffix={`vs ${compareTo}`} />
                  )}
                </div>
              </Link>
              <Link href="/past-cashflow" className="metric">
                <div className="metric-label">
                  <span className="dot" style={{ background: "var(--rust)" }} />
                  Spending
                </div>
                <div className="metric-value">
                  {busy ? <Skeleton width="80%" height={22} /> : fmt(current.spending)}
                </div>
                <div className="metric-foot">
                  {busy ? null : isThisMonth ? (
                    `${compareTo}: ${fmt(previous.spending)}`
                  ) : (
                    <Delta
                      pct={pctChange(current.spending, previous.spending)}
                      upIsGood={false}
                      suffix={`vs ${compareTo}`}
                    />
                  )}
                </div>
              </Link>
              <Link href="/financial-health" className="metric">
                <div className="metric-label">Savings rate</div>
                <div className="metric-value">
                  {busy ? (
                    <Skeleton width="60%" height={22} />
                  ) : current.savingsRate == null ? (
                    "—"
                  ) : (
                    `${Math.round(current.savingsRate * 100)}%`
                  )}
                </div>
                <div className="metric-foot">
                  {busy || current.savingsRate == null ? null : isThisMonth ? (
                    previous.savingsRate != null ? (
                      `${compareTo}: ${Math.round(previous.savingsRate * 100)}%`
                    ) : null
                  ) : rateDiffPts != null ? (
                    <span
                      className={`delta ${
                        Math.abs(rateDiffPts) < 0.5 ? "flat" : rateDiffPts > 0 ? "good" : "bad"
                      }`}
                    >
                      {rateDiffPts > 0 ? "+" : ""}
                      {rateDiffPts.toFixed(0)} pts
                    </span>
                  ) : null}
                </div>
              </Link>
            </div>
          </div>

          <div className="dash-grid">
            {/* 2 — How it's trending. */}
            <div className="card span-7">
              <CardHeader
                title="Income vs spending"
                subtitle={`Last ${plotMonths.length} months`}
                href="/past-cashflow"
                linkLabel="Past cashflow"
              />
              {busy && flows.size === 0 ? (
                <SkeletonLines lines={6} label="Loading trend" />
              ) : (
                <>
                  <CashflowTrendChart
                    flows={flows}
                    months={plotMonths}
                    selected={window_.months}
                  />
                  <div className="chart-legend" style={{ marginTop: 10 }}>
                    <span>
                      <i style={{ background: "var(--moss)" }} />
                      Income
                    </span>
                    <span>
                      <i style={{ background: "var(--rust)" }} />
                      Spending
                    </span>
                    {window_.months.length < plotMonths.length ? (
                      <span>Selected period highlighted</span>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            {/* 3 — Where the money went. */}
            <div className="card span-5">
              <CardHeader
                title="Where your money went"
                subtitle={periodLabel(window_, todayYmd)}
                href="/past-cashflow"
                linkLabel="Breakdown"
              />
              {busy ? (
                <SkeletonLines lines={6} label="Loading categories" />
              ) : categories.length === 0 ? (
                <EmptyState
                  icon="receipt"
                  title="No spending recorded"
                  action={
                    <Link href="/expenses" className="link-more">
                      Log an expense
                    </Link>
                  }
                >
                  Expenses you log for this period will be grouped by category here.
                </EmptyState>
              ) : (
                <div className="rank">
                  {categories.map((c, i) => {
                    const color = c.id === "__other__" ? "var(--muted)" : colorAt(i);
                    return (
                      <div className="rank-row" key={c.id}>
                        <div className="rank-name">
                          <span className="dot" style={{ background: color }} />
                          <span>{c.label}</span>
                        </div>
                        <div className="rank-val">
                          {fmt(c.amount)}
                          <small>{Math.round(c.share * 100)}%</small>
                        </div>
                        <div className="rank-bar">
                          <i
                            style={{
                              width: `${(c.amount / categories[0]!.amount) * 100}%`,
                              background: color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="span-6 span-sm-6">
              <BudgetCard ym={currentYm} todayYmd={todayYmd} />
            </div>
            <div className="span-6 span-sm-6">
              <RecentActivityCard />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
