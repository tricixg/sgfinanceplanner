"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CashflowTrendChart } from "@/components/dashboard/CashflowTrendChart";
import { BudgetCard } from "@/components/dashboard/BudgetCard";
import { RecentActivityCard } from "@/components/dashboard/RecentActivityCard";
import { CategoryBreakdown } from "@/components/dashboard/CategoryBreakdown";
import { MonthStepper } from "@/components/dashboard/MonthStepper";
import { CardHeader } from "@/components/ui/CardHeader";
import { Delta } from "@/components/ui/Delta";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState, ErrorState, Skeleton, SkeletonLines } from "@/components/ui/States";
import { useAppData } from "@/hooks/useAppData";
import { useCashflowAnalytics } from "@/hooks/useCashflowAnalytics";
import { buildCategoryColors } from "@/lib/finance/category-colors";
import {
  RANGE_OPTIONS,
  clampMonthYm,
  monthElapsed,
  normaliseRangeKey,
  pctChange,
  periodLabel,
  priorLabel,
  rangeWindow,
  summariseFlows,
  topWithOther,
  trendMonths,
  trendSubtitle,
  type RangeKey,
} from "@/lib/dashboard/cashflow";
import { effectiveCalendarDay, fmt, fmtSigned2 } from "@/lib/finance/helpers";
import { sgtTodayYmd } from "@/lib/time/sgt";
import { DomainLoadErrorBanners } from "@/components/app/DomainLoadErrorBanners";

type Props = {
  enabled: boolean;
};

const RANGE_STORAGE_KEY = "dashboard:range";
const SEGMENTS = RANGE_OPTIONS.map((o) => ({ value: o.key, label: o.short, compact: o.compact }));

function readStoredRange(): RangeKey {
  try {
    const stored = normaliseRangeKey(window.localStorage.getItem(RANGE_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Storage can be unavailable (private mode); the default range is fine.
  }
  return "month";
}

const signedWhole = (n: number) => `${n < 0 ? "-" : ""}${fmt(Math.abs(n))}`;

export function DashboardPage({ enabled }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { state: profile } = useAppData();
  // Fixed for the life of the page so every derived period uses the same "today".
  const [todayYmd] = useState(() => sgtTodayYmd());
  const currentYm = todayYmd.slice(0, 7);

  // A month in the URL means the user stepped to it — show it in Month view,
  // and keep it there so Back from a drill-down returns to the same month.
  const urlMonth = clampMonthYm(searchParams.get("month"), currentYm);
  const monthYm = urlMonth ?? currentYm;

  const [range, setRange] = useState<RangeKey>("month");
  useEffect(() => {
    if (!urlMonth) setRange(readStoredRange());
    // Only on mount: later URL changes come from this page's own controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMonthParam = useCallback(
    (ym: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (ym && ym !== currentYm) params.set("month", ym);
      else params.delete("month");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, currentYm]
  );

  const chooseRange = useCallback(
    (next: RangeKey) => {
      // Tapping Month again returns to the current month.
      if (next !== "month" || range === "month") setMonthParam(null);
      setRange(next);
      try {
        window.localStorage.setItem(RANGE_STORAGE_KEY, next);
      } catch {
        // Non-critical preference.
      }
      console.info("[DashboardPage] range", next);
    },
    [range, setMonthParam]
  );

  const chooseMonth = useCallback(
    (ym: string) => {
      setMonthParam(ym);
      console.info("[DashboardPage] month", ym);
    },
    [setMonthParam]
  );

  const window_ = useMemo(
    () => rangeWindow(range, currentYm, monthYm),
    [range, currentYm, monthYm]
  );
  const plotMonths = useMemo(() => trendMonths(window_, currentYm), [window_, currentYm]);
  const earliestYm = window_.prior[0]! < plotMonths[0]! ? window_.prior[0]! : plotMonths[0]!;

  const { flows, categoryOrder, loading, pending, error, reload } = useCashflowAnalytics(
    enabled,
    currentYm,
    earliestYm
  );
  const categoryColor = useMemo(() => buildCategoryColors(categoryOrder), [categoryOrder]);

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
  const isMonthView = range === "month";
  const isThisMonth = isMonthView && monthYm === currentYm;
  const periodText = periodLabel(window_, todayYmd);
  const backHref = isMonthView && urlMonth ? `/dashboard?month=${urlMonth}` : "/dashboard";
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
      <DomainLoadErrorBanners />
      <div className="dash-toolbar">
        <SegmentedControl
          options={SEGMENTS}
          value={range}
          onChange={chooseRange}
          label="Date range"
          fill
        />
        {isMonthView ? (
          <MonthStepper
            ym={monthYm}
            currentYm={currentYm}
            label={periodText}
            onChange={chooseMonth}
          />
        ) : (
          <span className="dash-period">{periodText}</span>
        )}
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
                subtitle={trendSubtitle(plotMonths, currentYm)}
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
                subtitle={periodText}
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
                <CategoryBreakdown
                  key={window_.months.join(",")}
                  rows={categories}
                  window={window_}
                  periodText={periodText}
                  backHref={backHref}
                  colorFor={categoryColor}
                />
              )}
            </div>

            <div className="span-6 span-sm-6">
              <BudgetCard ym={isMonthView ? monthYm : currentYm} todayYmd={todayYmd} />
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
