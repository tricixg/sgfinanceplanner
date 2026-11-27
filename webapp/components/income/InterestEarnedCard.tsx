"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartOptions } from "chart.js";
import { ChartBox } from "@/components/ChartBox";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { LoadErrorCallout } from "@/components/app/LoadErrorCallout";
import { colorAt } from "@/components/spending/chart-colors";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import type { InterestAnalyticsBundle } from "@/lib/income/analytics";

type Range = "6" | "12" | "24";

const RANGE_OPTIONS: { value: Range; label: string; compact: string }[] = [
  { value: "6", label: "6 months", compact: "6M" },
  { value: "12", label: "12 months", compact: "12M" },
  { value: "24", label: "24 months", compact: "24M" },
];

/** Single-series line: the title names it, so no legend. */
const CUMULATIVE_COLOR = "#1e8a89";

const moneyTick = (v: string | number) => "$" + Number(v).toLocaleString("en-US");

/**
 * Past Cashflow: interest earned per month stacked by cash account, plus a
 * separate running-total chart (two measures → two charts, never two y-axes).
 */
export function InterestEarnedCard({ enabled }: { enabled: boolean }) {
  const [range, setRange] = useState<Range>("12");
  const [data, setData] = useState<InterestAnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const { res, data: body } = await fetchJson<{
        interest?: InterestAnalyticsBundle;
        error?: string;
      }>(`/api/income/interest?months=${range}`, { credentials: "include" });
      if (!res.ok) throw new Error(body.error ?? "Failed to load interest");
      if (!body.interest) throw new Error("No interest data returned");
      hasDataRef.current = true;
      setData(body.interest);
      console.info("[InterestEarnedCard] loaded", {
        months: body.interest.months.length,
        total: body.interest.kpis.total,
      });
    } catch (e) {
      console.error("[InterestEarnedCard] load failed", e);
      setError(e instanceof Error ? e.message : "Failed to load interest");
    } finally {
      setLoading(false);
    }
  }, [enabled, range]);

  useEffect(() => {
    void load();
  }, [load]);

  useDomainEvent(["savings:changed", "accounts:changed"], () => {
    void load();
  });

  const labels = useMemo(() => (data?.months ?? []).map((ym) => formatMonthLabel(ym)), [data]);

  const barData = useMemo(() => {
    if (!data) return { labels, datasets: [] };
    return {
      labels,
      datasets: data.accounts.map((a) => ({
        label: a.label,
        // Colour follows the account (its place in the account list), not its rank.
        backgroundColor: colorAt(a.order),
        data: data.monthly.map(
          (m) => m.byAccount.find((r) => r.id === a.id)?.amount ?? 0
        ),
        stack: "interest",
      })),
    };
  }, [data, labels]);

  const barOptions = useMemo((): ChartOptions<"bar"> => {
    const cumulative = data?.cumulative ?? [];
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          mode: "index",
          filter: (item) => Number(item.raw) > 0,
          itemSort: (a, b) => Number(b.raw) - Number(a.raw),
          callbacks: {
            label: (ctx) => `${ctx.dataset.label ?? ""}: ${fmt2(Number(ctx.raw))}`,
            footer: (items) => {
              if (items.length === 0) return "";
              const idx = items[0]!.dataIndex;
              const total = items.reduce((s, item) => s + Number(item.raw ?? 0), 0);
              return [`Month total: ${fmt2(total)}`, `Running total: ${fmt2(cumulative[idx] ?? 0)}`];
            },
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: "#e6dfca" },
          ticks: { callback: moneyTick },
        },
      },
    };
  }, [data]);

  const lineData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: "Running total",
          data: data?.cumulative ?? [],
          borderColor: CUMULATIVE_COLOR,
          backgroundColor: CUMULATIVE_COLOR,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.25,
        },
      ],
    }),
    [data, labels]
  );

  const lineOptions = useMemo((): ChartOptions<"line"> => {
    const monthly = data?.monthly ?? [];
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Running total: ${fmt2(Number(ctx.raw))}`,
            afterLabel: (ctx) => `This month: ${fmt2(monthly[ctx.dataIndex]?.total ?? 0)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: "#e6dfca" }, ticks: { callback: moneyTick } },
      },
    };
  }, [data]);

  if (!enabled) return null;

  const kpis = data?.kpis;
  const hasInterest = (kpis?.total ?? 0) > 0;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-head" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Interest earned</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && hasDataRef.current ? <span className="note">Refreshing…</span> : null}
          <SegmentedControl
            label="Interest time range"
            options={RANGE_OPTIONS}
            value={range}
            onChange={setRange}
          />
        </div>
      </div>

      {error ? (
        <LoadErrorCallout title="Interest didn't load." message={error} onRetry={() => void load()}>
          {error}
        </LoadErrorCallout>
      ) : null}

      {!data && loading ? <p className="loading">Loading interest…</p> : null}

      {data && kpis ? (
        <>
          <div className="grid g4" style={{ marginBottom: 16 }}>
            <div className="stat accent">
              <div className="lbl">{data.months.length}-month total</div>
              <div className="val">{fmt2(kpis.total)}</div>
            </div>
            <div className="stat">
              <div className="lbl">Avg / month</div>
              <div className="val">{fmt2(kpis.avgPerMonth)}</div>
            </div>
            <div className="stat">
              <div className="lbl">This month</div>
              <div className="val">{fmt2(kpis.latestMonth)}</div>
            </div>
            <div className="stat">
              <div className="lbl">Top account</div>
              <div className="val" style={{ fontSize: "1rem" }}>
                {kpis.topAccount ? kpis.topAccount.label : "—"}
              </div>
              {kpis.topAccount ? (
                <div className="note">{fmt2(kpis.topAccount.total)}</div>
              ) : null}
            </div>
          </div>

          {hasInterest ? (
            <>
              <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>By account, per month</h4>
              <ChartBox type="bar" data={barData} options={barOptions} height={280} />
              <h4 style={{ margin: "16px 0 8px", fontSize: 14 }}>Running total</h4>
              <ChartBox type="line" data={lineData} options={lineOptions} height={180} />
            </>
          ) : (
            <p className="note">
              No interest recorded in this period yet. On a cash account, use Adjustment → Set
              balance and tick <em>This is interest</em>. Older adjustments can be ticked from
              Transactions.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
