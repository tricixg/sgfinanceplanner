"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MonthStepper } from "@/components/dashboard/MonthStepper";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import { monthYear, periodLabel, rangeWindow } from "@/lib/dashboard/cashflow";
import { addMonthsYm } from "@/lib/finance/calendar";
import { buildCategoryColors } from "@/lib/finance/category-colors";
import { fmt } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";
import type { SpendingAnalyticsBundle } from "@/lib/spending/analytics";
import type { SpendingScope } from "@/lib/spending/bucket-spend";
import { sgtTodayYmd } from "@/lib/time/sgt";
import { buildMonthCompareRows } from "./month-compare";

type Props = {
  scope: SpendingScope;
};

function changeText(change: number | null): string {
  if (change === null) return "new this month";
  const pct = Math.round(change * 100);
  if (pct === 0) return "no change";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/** One month's spend per category, with a marker for the month before; steps month by month. */
export function SpendingMonthCompareChart({ scope }: Props) {
  const [todayYmd] = useState(() => sgtTodayYmd());
  const currentYm = todayYmd.slice(0, 7);
  const [ym, setYm] = useState(currentYm);
  const [bundle, setBundle] = useState<SpendingAnalyticsBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cacheRef = useRef(new Map<string, SpendingAnalyticsBundle>());
  const wantedRef = useRef("");
  /** Row whose tooltip is showing (hover, keyboard focus or tap). */
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const key = `${scope}:${ym}`;
    wantedRef.current = key;
    const cached = cacheRef.current.get(key);
    if (cached) {
      setBundle(cached);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ throughYm: ym, months: "2", scope });
      const { res, data } = await fetchJson<{ analytics?: SpendingAnalyticsBundle; error?: string }>(
        `/api/spending/analytics?${qs}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to load spending");
      if (!data.analytics) throw new Error("No analytics returned");
      cacheRef.current.set(key, data.analytics);
      // Ignore a slow response for a month the user has already stepped away from.
      if (wantedRef.current === key) setBundle(data.analytics);
      console.info("[SpendingMonthCompareChart] loaded", { ym, scope });
    } catch (e) {
      console.error("[SpendingMonthCompareChart] load failed", e);
      if (wantedRef.current === key) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (wantedRef.current === key) setLoading(false);
    }
  }, [scope, ym]);

  useEffect(() => {
    void load();
  }, [load]);

  useDomainEvent(["expense:changed", "budget:changed", "cards:changed"], () => {
    cacheRef.current.clear();
    void load();
  });

  const prevYm = addMonthsYm(ym, -1);
  const prevShort = monthYear(prevYm).split(" ")[0];
  const label = periodLabel(rangeWindow("month", currentYm, ym), todayYmd);

  const view = useMemo(() => {
    if (!bundle) return null;
    const chosen = bundle.monthly.find((m) => m.ym === ym);
    const before = bundle.monthly.find((m) => m.ym === prevYm);
    if (!chosen) return null;
    return {
      ...buildMonthCompareRows(chosen.byCategory, before?.byCategory ?? []),
      colorFor: buildCategoryColors(bundle.categoryOrder),
    };
  }, [bundle, ym, prevYm]);

  const pct = (n: number, scale: number) => (scale > 0 ? (n / scale) * 100 : 0);

  return (
    <div className="card month-compare" style={{ marginBottom: 16 }}>
      <div className="month-compare-head">
        <h3 style={{ margin: 0 }}>Spending by category</h3>
        <MonthStepper ym={ym} currentYm={currentYm} label={label} onChange={setYm} />
      </div>
      <p className="note month-compare-caption">
        Bars are {monthYear(ym)}; the <span className="month-compare-key" aria-hidden="true" /> marker
        is {monthYear(prevYm)}.
      </p>

      {error && !view ? (
        <p className="note">
          {error}{" "}
          <button type="button" className="btn sm" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : !view ? (
        <p className="loading">Loading {monthYear(ym)}…</p>
      ) : view.rows.length === 0 ? (
        <p className="note">
          No spending in {monthYear(ym)} or {monthYear(prevYm)}.
        </p>
      ) : (
        <ul className="month-compare-rows" aria-busy={loading}>
          {view.rows.map((r) => {
            const text = `${r.label}: ${fmt(r.amount)} in ${monthYear(ym)}, ${fmt(
              r.prevAmount
            )} in ${monthYear(prevYm)} (${changeText(r.change)})`;
            const endPct = pct(Math.max(r.amount, r.prevAmount), view.scale);
            const barPct = pct(r.amount, view.scale);
            const active = activeId === r.id;
            return (
              <li
                key={r.id}
                className={`month-compare-row${active ? " is-active" : ""}`}
                aria-label={text}
                tabIndex={0}
                onMouseEnter={() => setActiveId(r.id)}
                onMouseLeave={() => setActiveId((id) => (id === r.id ? null : id))}
                onFocus={() => setActiveId(r.id)}
                onBlur={() => setActiveId((id) => (id === r.id ? null : id))}
                onClick={() => setActiveId((id) => (id === r.id ? null : r.id))}
              >
                <span className="month-compare-label">{r.label}</span>
                <span className="month-compare-track">
                  {r.amount > 0 ? (
                    <i
                      className="month-compare-bar"
                      style={{
                        width: `${pct(r.amount, view.scale)}%`,
                        background: view.colorFor(r.id, r.label),
                      }}
                    />
                  ) : null}
                  {r.prevAmount > 0 ? (
                    <i
                      className="month-compare-marker"
                      style={{ left: `${pct(r.prevAmount, view.scale)}%` }}
                    />
                  ) : null}
                  {/* Values sit just past whichever ends further right: the bar or the marker. */}
                  <span className="month-compare-val" style={{ left: `${endPct}%` }}>
                    <b>{fmt(r.amount)}</b>
                    <span className="month-compare-prev">
                      {prevShort} {fmt(r.prevAmount)}
                    </span>
                  </span>
                  {active ? (
                    <span
                      className={`month-compare-tip${barPct > 55 ? " is-flipped" : ""}`}
                      style={{ left: `${barPct}%` }}
                      role="tooltip"
                    >
                      <b>{r.label}</b>
                      <span>
                        {monthYear(ym)} <b>{fmt(r.amount)}</b>
                      </span>
                      <span>
                        {monthYear(prevYm)} {fmt(r.prevAmount)} · {changeText(r.change)}
                      </span>
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
