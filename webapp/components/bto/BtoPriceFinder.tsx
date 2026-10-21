"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BtoLoanType, BtoPlannerPrefs, DashboardState } from "@/lib/types";
import {
  BANK_LOAN_RULES,
  addMonthsYm,
  btoAffordabilityZone,
  btoLoanTerms,
  btoPriceBands,
  computeBTO,
  resolveBTOMilestoneDates,
  resolveBTOMonthOffsets,
  resolveBtoOAMonthly,
  totalLoanLoadForMonth,
  type BTOInputs,
  type BtoAffordabilityZone,
} from "@/lib/finance";
import { fmt, formatMonthLabel } from "@/lib/finance/helpers";
import { effectiveCash } from "@/lib/finance/savings-totals";
import { DecimalInput } from "@/components/DecimalInput";
import { BtoOATimelineChart } from "@/components/bto/BtoOATimelineChart";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useBtoPlannerData } from "@/hooks/useBtoPlannerData";
import { usePageSavings } from "@/hooks/usePageSavings";
import { sgtTodayYmd } from "@/lib/time/sgt";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

const PRICE_MIN = 300000;
/** Most expensive HDB flat price considered. */
const PRICE_MAX = 810000;
const PRICE_STEP = 5000;
const INPUTS_OPEN_KEY = "bto-price-finder:inputs-open";

const LOAN_LABEL: Record<BtoLoanType, string> = { hdb: "HDB loan", bank: "Bank loan" };

function zoneName(zone: BtoAffordabilityZone, loan: BtoLoanType): string {
  switch (zone) {
    case "cpf":
      return loan === "bank" ? "CPF + 5% cash" : "Fully on CPF";
    case "cpf-late":
      return "CPF if keys come late";
    case "cash":
      return "Needs some cash";
    default:
      return "Stretch";
  }
}

/** "YYYY-MM-DD" → "31 Mar 2033". */
function formatYmdLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * BTO price finder — drag the flat price and see, against the household's
 * real CPF OA, salaries, savings and saved BTO plan, which prices CPF covers
 * (on the estimated and latest key dates), which need cash, and when OA
 * catches up with each bill. Edits here are a what-if until saved to the plan.
 */
export function BtoPriceFinder({ state: S, setState }: Props) {
  const user = useAppSession();
  const { savingsTotals } = usePageSavings(user?.id, S);
  const {
    savedPrefs,
    savePrefs,
    partnerOALive,
    selfMonthlyFromContrib,
    partnerMonthlyFromContrib,
  } = useBtoPlannerData(S, setState);

  // Planner prefs edited here stay a draft until "Save to plan"; OA balances
  // and cash savings come from CPF / accounts and are what-if only.
  const [draft, setDraft] = useState<BtoPlannerPrefs | null>(null);
  const [tOAOverride, setTOAOverride] = useState<number | null>(null);
  const [pOAOverride, setPOAOverride] = useState<number | null>(null);
  const [cashOverride, setCashOverride] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [inputsOpen, setInputsOpen] = useState(true);

  // Remember whether "Your numbers" is collapsed — a per-browser convenience.
  useEffect(() => {
    try {
      if (localStorage.getItem(INPUTS_OPEN_KEY) === "0") setInputsOpen(false);
    } catch {
      /* storage unavailable — keep the panel open */
    }
  }, []);
  const toggleInputs = () => {
    setInputsOpen((open) => {
      try {
        localStorage.setItem(INPUTS_OPEN_KEY, open ? "0" : "1");
      } catch {
        /* storage unavailable — state still toggles for this visit */
      }
      return !open;
    });
  };

  const p = draft ?? savedPrefs;
  const update = (patch: Partial<BtoPlannerPrefs>) => {
    setDraft((prev) => ({ ...(prev ?? savedPrefs), ...patch }));
    console.info("[BtoPriceFinder] draft updated", patch);
  };

  const savedCash = savingsTotals ? effectiveCash(savingsTotals, true) : 0;
  const tOA = tOAOverride ?? S.oa;
  const pOA = pOAOverride ?? partnerOALive ?? p.pOA;
  const cash = cashOverride ?? savedCash;
  const dirty =
    draft != null || tOAOverride != null || pOAOverride != null || cashOverride != null;

  const resetAll = () => {
    setDraft(null);
    setTOAOverride(null);
    setPOAOverride(null);
    setCashOverride(null);
    console.info("[BtoPriceFinder] reset to saved");
  };

  const saveToPlan = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await savePrefs(draft);
      setDraft(null);
    } catch (e) {
      console.error("[BtoPriceFinder] save failed", e);
    } finally {
      setSaving(false);
    }
  };

  const todayYmd = useMemo(() => sgtTodayYmd(), []);
  const todayYm = todayYmd.slice(0, 7);
  const monthLabel = (m: number) => formatMonthLabel(addMonthsYm(todayYm, m));

  const offsets = useMemo(() => resolveBTOMonthOffsets(p, todayYmd), [p, todayYmd]);
  const milestones = useMemo(() => resolveBTOMilestoneDates(p), [p]);
  const { tOAMonthly, pOAMonthly } = resolveBtoOAMonthly(p, {
    self: selfMonthlyFromContrib,
    partner: partnerMonthlyFromContrib,
  });

  // Debt repayments still running at key collection (card instalments,
  // personal loans) count against a bank loan's 55% total-debt limit.
  const otherDebtAtKeys = totalLoanLoadForMonth(
    S.loans,
    S.otherLoans ?? [],
    milestones.keysYmd.slice(0, 7)
  );
  const hdbTerms = btoLoanTerms({ ...p, loanAtKeys: "hdb" }, { otherDebtMonthly: otherDebtAtKeys });
  const bankTerms = btoLoanTerms({ ...p, loanAtKeys: "bank" }, { otherDebtMonthly: otherDebtAtKeys });
  const loanTerms = p.loanAtKeys === "bank" ? bankTerms : hdbTerms;
  const bank = bankTerms.bank;

  const shared = useMemo<Omit<BTOInputs, "price" | "rate" | "tenure" | "maxLoanEligible">>(
    () => ({
      optionFee: p.optionFee,
      legalFee: p.legalFee,
      staggered: p.staggered,
      schemes: p.schemes,
      tSal: p.tSal,
      pSal: p.pSal,
      tOA,
      pOA,
      tOAMonthly,
      pOAMonthly,
      ...offsets,
    }),
    [p, tOA, pOA, tOAMonthly, pOAMonthly, offsets]
  );
  const withTerms = (t: typeof loanTerms): Omit<BTOInputs, "price"> => ({
    ...shared,
    rate: t.rate,
    tenure: t.tenure,
    maxLoanEligible: t.maxLoanEligible,
    minCashPct: t.minCashPct,
  });
  const base = useMemo(
    () => withTerms(loanTerms),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loanTerms is rebuilt each render; key on its values
    [shared, loanTerms.rate, loanTerms.tenure, loanTerms.maxLoanEligible, loanTerms.minCashPct]
  );

  const priceMin = Math.min(PRICE_MIN, Math.floor(p.price / PRICE_STEP) * PRICE_STEP);
  const priceMax = Math.max(PRICE_MAX, Math.ceil(p.price / PRICE_STEP) * PRICE_STEP);
  const bands = useMemo(
    () => btoPriceBands(base, cash, { min: priceMin, max: priceMax, step: PRICE_STEP }),
    [base, cash, priceMin, priceMax]
  );
  const b = useMemo(() => computeBTO({ ...base, price: p.price }), [base, p.price]);
  const zone = btoAffordabilityZone(b, cash);
  // Both loans at this price, for the side-by-side comparison.
  const bHdb = p.loanAtKeys === "hdb" ? b : computeBTO({ ...withTerms(hdbTerms), price: p.price });
  const bBank = p.loanAtKeys === "bank" ? b : computeBTO({ ...withTerms(bankTerms), price: p.price });

  // Contiguous zone runs → ruler segments, each spanning half a step either
  // side of its grid points so the segments line up with the slider thumb.
  const segments = useMemo(() => {
    const n = bands.grid.length;
    const out: { zone: BtoAffordabilityZone; widthPct: number }[] = [];
    let start = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || bands.grid[i].zone !== bands.grid[start].zone) {
        const from = start === 0 ? 0 : (start - 0.5) / (n - 1);
        const to = i === n ? 1 : (i - 0.5) / (n - 1);
        out.push({ zone: bands.grid[start].zone, widthPct: (to - from) * 100 });
        start = i;
      }
    }
    return out;
  }, [bands]);

  // Round $100k ticks, plus the range's top end (e.g. the $810k HDB max).
  const ticks: number[] = [];
  for (let t = Math.ceil(priceMin / 100000) * 100000; t <= priceMax - 50000; t += 100000) {
    ticks.push(t);
  }
  ticks.push(priceMax);

  const setPrice = (price: number) =>
    update({ price: Math.min(priceMax, Math.max(priceMin, price)) });

  const latestLabel = p.keysDateLatest ? formatYmdLabel(p.keysDateLatest) : "";
  const coveredLabel = b.kcCoveredOffset != null ? monthLabel(b.kcCoveredOffset) : "";
  const loanFullPrice =
    loanTerms.maxLoanEligible > 1
      ? Math.floor(loanTerms.maxLoanEligible / 0.75 / PRICE_STEP) * PRICE_STEP
      : null;
  const bankCashMin = p.price * BANK_LOAN_RULES.minCashPct;

  let verdict: string;
  if (zone === "cpf" && b.mandatoryCashKC > 0) {
    verdict = `At ${fmt(p.price)} with a bank loan, CPF OA pays everything except the ${fmt(bankCashMin)} (5% of the price) that must be cash, and your OA inflow covers the ${fmt(b.mortgage)} monthly instalment.`;
  } else if (zone === "cpf") {
    verdict = `At ${fmt(p.price)}, CPF OA pays the downpayment at both AFL and key collection, and your OA inflow covers the ${fmt(b.mortgage)} monthly instalment. Only the ${fmt(p.optionFee)} option fee is cash.`;
  } else if (zone === "cpf-late") {
    verdict = `At ${fmt(p.price)}, CPF is ${fmt(b.cashKC)} short at the estimated key date, but catches up by ${coveredLabel}, before the latest key date (${latestLabel}).`;
  } else if (zone === "cash") {
    verdict = `At ${fmt(p.price)}, you'd need ${fmt(b.totalCash)} in cash in total, which fits within your ${fmt(cash)} savings.`;
  } else {
    const bits: string[] = [];
    if (!b.mortOK) {
      bits.push(
        `the ${fmt(b.mortgage)} instalment is ${fmt(-b.mortSurplus)}/mo more than your OA inflow`
      );
    }
    if (b.totalCash > cash) {
      bits.push(`you'd need ${fmt(b.totalCash)} in cash against ${fmt(cash)} saved`);
    }
    verdict =
      `At ${fmt(p.price)}, ${bits.join(", and ")}.` +
      (bands.maxPrice.cash != null ? ` Prices up to ${fmt(bands.maxPrice.cash)} stay within reach.` : "");
  }

  const kcCpfUsed = Math.min(b.neededKC, b.cpfAvailKC);
  const latestCpfUsed = Math.min(b.neededKC, b.cpfAvailLatestKC);

  const chip = (ok: boolean, okText: string, badText: string) => (
    <span className={`bto-pf-chip ${ok ? "ok" : "bad"}`}>{ok ? okText : badText}</span>
  );
  const paidFrom = (cpf: number, cashPart: number) =>
    cashPart > 0 ? (
      <>
        CPF {fmt(cpf)} + <span className="neg">cash {fmt(cashPart)}</span>
      </>
    ) : (
      <>CPF {fmt(cpf)}</>
    );

  return (
    <section className="panel on bto-pf">
      <div className="bto-page-head">
        <Link href="/bto" className="btn ghost sm">
          ← BTO planner
        </Link>
        <div className="bto-pf-actions">
          {!inputsOpen && (
            <button
              type="button"
              className="btn ghost sm"
              aria-expanded={false}
              aria-controls="bto-pf-inputs"
              onClick={toggleInputs}
            >
              Show your numbers
            </button>
          )}
          {dirty && (
            <button type="button" className="btn ghost sm" onClick={resetAll}>
              Reset to saved
            </button>
          )}
          <button
            type="button"
            className="btn sm"
            disabled={!draft || saving}
            onClick={() => void saveToPlan()}
          >
            {saving ? "Saving…" : "Save to plan"}
          </button>
        </div>
      </div>

      <div className="kicker">{p.projectName} · price finder</div>
      <h1 className="bto-pf-title">What flat price can we afford?</h1>

      <div className={`bto-pf-layout ${inputsOpen ? "" : "collapsed"}`}>
        <div className="bto-pf-main">
          <div className="card bto-pf-price">
            <div className="bto-pf-price-head">
              <div>
                <div className="stat-lbl">Flat price</div>
                <div className="bto-pf-price-val">{fmt(p.price)}</div>
                <div className="note">
                  Loan {fmt(b.loan)}
                  {b.loanCapped ? " (your max)" : ""} · {fmt(b.mortgage)}/mo over {loanTerms.tenure} yrs
                </div>
              </div>
              <div className="bto-pf-stepper">
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label="Lower price by $5,000"
                  onClick={() => setPrice(p.price - PRICE_STEP)}
                >
                  −5k
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label="Raise price by $5,000"
                  onClick={() => setPrice(p.price + PRICE_STEP)}
                >
                  +5k
                </button>
              </div>
            </div>

            <div className="bto-pf-ruler-wrap">
              <div className="bto-pf-ruler" aria-hidden="true">
                {segments.map((seg, i) => (
                  <span key={i} className={`z-${seg.zone}`} style={{ width: `${seg.widthPct}%` }} />
                ))}
              </div>
              <input
                type="range"
                className="bto-pf-range"
                min={priceMin}
                max={priceMax}
                step={PRICE_STEP}
                value={p.price}
                aria-label="Flat price"
                aria-valuetext={`${fmt(p.price)}, ${zoneName(zone, p.loanAtKeys)}`}
                onChange={(e) => setPrice(+e.target.value)}
              />
            </div>
            <div className="bto-pf-ticks" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t} style={{ left: `${((t - priceMin) / (priceMax - priceMin)) * 100}%` }}>
                  ${Math.round(t / 1000)}k
                </span>
              ))}
            </div>

            <div className="bto-pf-legend">
              {(["cpf", "cpf-late", "cash"] as const).map((z) => {
                const max = bands.maxPrice[z];
                // Waiting for the latest key date only helps if it lifts the ceiling.
                const sameAsCpf =
                  z === "cpf-late" && max != null && max === bands.maxPrice.cpf && max < priceMax;
                return (
                  <button
                    key={z}
                    type="button"
                    disabled={max == null}
                    onClick={() => max != null && setPrice(max)}
                  >
                    <span className={`sw z-${z}`} />
                    <span className="t">{zoneName(z, p.loanAtKeys)}</span>
                    <span className="v">{max != null ? `up to ${fmt(max)}` : "none in range"}</span>
                    {sameAsCpf && (
                      <span className="sub">Same as above: later keys don&apos;t raise it</span>
                    )}
                  </button>
                );
              })}
              {loanFullPrice != null && (
                <button type="button" onClick={() => setPrice(Math.min(loanFullPrice, priceMax))}>
                  <span className="sw z-loan" />
                  <span className="t">
                    {p.loanAtKeys === "bank" ? "Max bank loan" : "Your HDB loan"} (
                    {fmt(loanTerms.maxLoanEligible)}) covers 75% up to
                  </span>
                  <span className="v">{fmt(loanFullPrice)}</span>
                  <span className="sub">
                    {loanFullPrice >= priceMax
                      ? `Covers the full 75% at every price up to ${fmt(priceMax)}`
                      : "Above this, the extra is due at keys"}
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="card bto-pf-verdict" aria-live="polite">
            <span className={`bto-pf-pill z-${zone}`}>{zoneName(zone, p.loanAtKeys)}</span>
            <p>{verdict}</p>
          </div>

          <div className="bto-pf-checks">
            <div className="bto-pf-check">
              <div className="top">
                <span className="stat-lbl">Sign AFL</span>
                {chip(b.cashAFL <= 0, "CPF covers", `Cash ${fmt(b.cashAFL)}`)}
              </div>
              <div className="when">{formatYmdLabel(milestones.aflYmd)}</div>
              <div className="big">{fmt(b.neededAFL)}</div>
              <div className="row">
                <span>OA by then</span>
                <span className="num">{fmt(b.cpfAvailAFL)}</span>
              </div>
              <div className="row">
                <span>Downpayment + BSD + legal</span>
              </div>
            </div>
            <div className="bto-pf-check">
              <div className="top">
                <span className="stat-lbl">Keys · estimated</span>
                {chip(
                  b.dpOK,
                  b.mandatoryCashKC > 0 ? "CPF + 5% cash" : "CPF covers",
                  `Short ${fmt(b.cashKC - b.mandatoryCashKC)}`
                )}
              </div>
              <div className="when">{formatYmdLabel(milestones.keysYmd)}</div>
              <div className="big">{fmt(b.neededKC)}</div>
              <div className="row">
                <span>OA by then</span>
                <span className="num">{fmt(b.cpfAvailKC)}</span>
              </div>
              <div className="row">
                <span>
                  {b.loanShortfall > 0
                    ? `Incl. ${fmt(b.loanShortfall)} loan top-up`
                    : "Remaining downpayment"}
                  {b.mandatoryCashKC > 0 ? ` · ${fmt(b.mandatoryCashKC)} must be cash` : ""}
                </span>
              </div>
            </div>
            <div className="bto-pf-check">
              <div className="top">
                <span className="stat-lbl">Keys · latest</span>
                {latestLabel
                  ? chip(
                      b.latestKcOK,
                      b.dpOK ? "CPF covers" : "Catches up",
                      `Short ${fmt(b.cashLatestKC)}`
                    )
                  : null}
              </div>
              <div className="when">{latestLabel || "Not set"}</div>
              <div className="big">{fmt(b.neededKC)}</div>
              <div className="row">
                <span>OA by then</span>
                <span className="num">{fmt(b.cpfAvailLatestKC)}</span>
              </div>
              <div className="row">
                <span>
                  {coveredLabel ? `OA covers it from ${coveredLabel}` : "Not covered by this date"}
                </span>
              </div>
            </div>
            <div className="bto-pf-check">
              <div className="top">
                <span className="stat-lbl">Monthly mortgage</span>
                {chip(b.mortOK, "OA covers", `Short ${fmt(-b.mortSurplus)}/mo`)}
              </div>
              <div className="when">From key collection</div>
              <div className="big">
                {fmt(b.mortgage)}
                <small>/mo</small>
              </div>
              <div className="row">
                <span>OA inflow</span>
                <span className="num">{fmt(b.oaInflow)}/mo</span>
              </div>
              <div className="row">
                <span>
                  {b.mortOK ? `Spare ${fmt(b.mortSurplus)}/mo` : "Topped up from salary"}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="bto-pf-chart-head">
              <span className="stat-lbl">HDB loan vs bank loan at key collection</span>
              <span className="note">
                Bank loan sized on today&apos;s salaries ({fmt(p.tSal + p.pSal)}/mo)
              </span>
            </div>
            <div className="bto-timeline-table-scroll">
              <table className="bto-pf-table bto-pf-compare">
                <thead>
                  <tr>
                    <th>At {fmt(p.price)}</th>
                    {(["hdb", "bank"] as const).map((t) => (
                      <th key={t} className={`num ${p.loanAtKeys === t ? "on" : ""}`}>
                        {LOAN_LABEL[t]}
                        {p.loanAtKeys === t ? " · in use" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Max loan</td>
                    <td className="num">
                      {p.maxLoanEligible > 0 ? fmt(p.maxLoanEligible) : "75% of price"}
                    </td>
                    <td className="num">{fmt(bank.maxLoan)}</td>
                  </tr>
                  <tr>
                    <td>Loan at this price</td>
                    <td className="num">{fmt(bHdb.loan)}</td>
                    <td className="num">{fmt(bBank.loan)}</td>
                  </tr>
                  <tr>
                    <td>Interest · tenure</td>
                    <td className="num">
                      {p.rate}% · {p.tenure} yrs
                    </td>
                    <td className="num">
                      {p.bankRate}% · {bank.tenureYears} yrs
                    </td>
                  </tr>
                  <tr>
                    <td>Monthly instalment</td>
                    <td className={`num ${bHdb.mortOK ? "" : "neg"}`}>{fmt(bHdb.mortgage)}</td>
                    <td className={`num ${bBank.mortOK ? "" : "neg"}`}>{fmt(bBank.mortgage)}</td>
                  </tr>
                  <tr>
                    <td>Due at key collection</td>
                    <td className="num">{fmt(bHdb.neededKC)}</td>
                    <td className="num">{fmt(bBank.neededKC)}</td>
                  </tr>
                  <tr>
                    <td>Cash needed in total</td>
                    <td className={`num ${bHdb.totalCash > cash ? "neg" : ""}`}>
                      {fmt(bHdb.totalCash)}
                    </td>
                    <td className={`num ${bBank.totalCash > cash ? "neg" : ""}`}>
                      {fmt(bBank.totalCash)}
                    </td>
                  </tr>
                  <tr>
                    <td>Affordability</td>
                    <td className="num">{zoneName(btoAffordabilityZone(bHdb, cash), "hdb")}</td>
                    <td className="num">{zoneName(btoAffordabilityZone(bBank, cash), "bank")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="note" style={{ marginTop: 10 }}>
              Bank max loan: {Math.round(BANK_LOAN_RULES.msr * 100)}% of income ={" "}
              {fmt(bank.msrPayment)}/mo
              {otherDebtAtKeys > 0
                ? `; the ${Math.round(BANK_LOAN_RULES.tdsr * 100)}% total-debt limit leaves ${fmt(bank.tdsrPayment)}/mo after ${fmt(otherDebtAtKeys)}/mo of loans still running then`
                : ""}
              . Banks test this at {BANK_LOAN_RULES.stressRatePct}% over {bank.tenureYears} yrs,
              not the actual rate, so the max is {fmt(bank.maxLoan)}. Bank loans also need 5% of
              the price in cash and must end by age 65 for the full 75%.
            </p>
            <button
              type="button"
              className="btn ghost sm"
              style={{ marginTop: 10 }}
              onClick={() => update({ loanAtKeys: p.loanAtKeys === "bank" ? "hdb" : "bank" })}
            >
              Use {p.loanAtKeys === "bank" ? "HDB loan" : "bank loan"} for this plan
            </button>
          </div>

          <div className="card">
            <div className="bto-pf-chart-head">
              <span className="stat-lbl">CPF OA timeline at this price</span>
              <div className="bto-pf-key">
                <span>
                  <i className="oa" />
                  Pooled OA (yours + partner)
                </span>
                <span>
                  <i className="due" />
                  Next bill due
                </span>
              </div>
            </div>
            <BtoOATimelineChart
              series={b.pooledSeries}
              todayYm={todayYm}
              milestones={[
                { month: offsets.bookingOffsetMonths, label: "Booking", tone: "muted" },
                { month: offsets.aflOffsetMonths, label: "AFL", tone: "ink" },
                { month: offsets.kcOffsetMonths, label: "Est. keys", tone: "ink" },
                ...(latestLabel
                  ? [{ month: offsets.latestKcOffsetMonths, label: "Latest keys", tone: "gold" as const }]
                  : []),
              ]}
              covered={
                b.kcCoveredOffset != null
                  ? { month: b.kcCoveredOffset, due: b.neededKC, label: `Covers keys bill · ${coveredLabel}` }
                  : null
              }
            />
            <div className="bto-timeline-table-scroll">
              <table className="bto-pf-table">
                <thead>
                  <tr>
                    <th>Milestone</th>
                    <th>When</th>
                    <th className="num">Due</th>
                    <th>Paid from</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Booking</td>
                    <td>{formatYmdLabel(milestones.bookingYmd)}</td>
                    <td className="num">{fmt(p.optionFee)}</td>
                    <td>Cash (option fee)</td>
                  </tr>
                  <tr>
                    <td>Sign AFL</td>
                    <td>{formatYmdLabel(milestones.aflYmd)}</td>
                    <td className="num">{fmt(b.neededAFL)}</td>
                    <td>{paidFrom(b.cpfUsedAFL, b.cashAFL)}</td>
                  </tr>
                  <tr>
                    <td>Keys · estimated</td>
                    <td>{formatYmdLabel(milestones.keysYmd)}</td>
                    <td className="num">{fmt(b.neededKC)}</td>
                    <td>{paidFrom(kcCpfUsed, b.cashKC)}</td>
                  </tr>
                  {latestLabel && (
                    <tr>
                      <td>Keys · latest</td>
                      <td>{latestLabel}</td>
                      <td className="num">{fmt(b.neededKC)}</td>
                      <td>{paidFrom(latestCpfUsed, b.cashLatestKC)}</td>
                    </tr>
                  )}
                  <tr>
                    <td>Mortgage</td>
                    <td>After keys</td>
                    <td className="num">{fmt(b.mortgage)}/mo</td>
                    <td>
                      {b.mortOK ? (
                        "CPF OA"
                      ) : (
                        <>
                          CPF {fmt(b.oaInflow)} +{" "}
                          <span className="neg">cash {fmt(-b.mortSurplus)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside
          id="bto-pf-inputs"
          className="card bto-pf-inputs"
          aria-label="Your numbers"
          hidden={!inputsOpen}
        >
          <div className="bto-pf-inputs-head">
            <span className="stat-lbl">Your numbers</span>
            <button
              type="button"
              className="btn ghost sm"
              aria-expanded={true}
              aria-controls="bto-pf-inputs"
              onClick={toggleInputs}
            >
              Hide
            </button>
          </div>

          <div className="bto-pf-group">
            <div className="glbl">Income</div>
            <div className="bto-pf-pair">
              <label className="bto-field">
                Your salary
                <DecimalInput value={p.tSal} onChange={(v) => update({ tSal: v })} />
              </label>
              <label className="bto-field">
                Partner salary
                <DecimalInput value={p.pSal} onChange={(v) => update({ pSal: v })} />
              </label>
            </div>
            <p className="note">
              Household {fmt(p.tSal + p.pSal)}/mo · OA inflow {fmt(b.oaInflow)}/mo · grants{" "}
              {fmt(b.totalGrants)}
            </p>
          </div>

          <div className="bto-pf-group">
            <div className="glbl">CPF OA today</div>
            <div className="bto-pf-pair">
              <label className="bto-field">
                Yours
                <DecimalInput value={tOA} onChange={(v) => setTOAOverride(v)} />
              </label>
              <label className="bto-field">
                Partner
                {partnerOALive != null ? (
                  <DecimalInput value={pOA} onChange={(v) => setPOAOverride(v)} />
                ) : (
                  <DecimalInput value={p.pOA} onChange={(v) => update({ pOA: v })} />
                )}
              </label>
            </div>
            <label className="bto-field">
              Cash savings for the flat
              <DecimalInput value={cash} onChange={(v) => setCashOverride(v)} />
            </label>
            <p className="note">
              From your CPF tab{partnerOALive != null ? ", your partner's linked CPF" : ""} and
              savings accounts ({fmt(savedCash)}). Changes to these are a what-if and aren&apos;t
              saved.
            </p>
          </div>

          <div className="bto-pf-group">
            <div className="glbl">Timeline</div>
            <div className="bto-pf-pair">
              <label className="bto-field">
                Booking
                <input
                  type="date"
                  value={milestones.bookingYmd}
                  onChange={(e) => update({ bookingDateActual: e.target.value })}
                />
              </label>
              <label className="bto-field">
                Sign AFL{p.aflDateActual ? "" : " (est.)"}
                <input
                  type="date"
                  value={milestones.aflYmd}
                  onChange={(e) => update({ aflDateActual: e.target.value })}
                />
              </label>
            </div>
            <div className="bto-pf-pair">
              <label className="bto-field">
                Key collection{p.keysDateActual ? "" : " (est.)"}
                <input
                  type="date"
                  value={milestones.keysYmd}
                  onChange={(e) => update({ keysDateActual: e.target.value })}
                />
              </label>
              <label className="bto-field">
                Latest keys
                <input
                  type="date"
                  value={p.keysDateLatest}
                  onChange={(e) => update({ keysDateLatest: e.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="bto-pf-group">
            <div className="glbl">Loan at key collection</div>
            <div className="bto-mode-segment" role="group" aria-label="Loan at key collection">
              {(["hdb", "bank"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={p.loanAtKeys === t ? "active" : ""}
                  aria-pressed={p.loanAtKeys === t}
                  onClick={() => update({ loanAtKeys: t })}
                >
                  {LOAN_LABEL[t]}
                </button>
              ))}
            </div>
            {p.loanAtKeys === "hdb" ? (
              <>
                <label className="bto-field">
                  Max loan (from your HLE letter, 0 = 75% of price)
                  <DecimalInput
                    value={p.maxLoanEligible}
                    onChange={(v) => update({ maxLoanEligible: v })}
                  />
                </label>
                <div className="bto-pf-pair">
                  <label className="bto-field">
                    Interest % p.a.
                    <DecimalInput value={p.rate} onChange={(v) => update({ rate: v })} />
                  </label>
                  <label className="bto-field">
                    Tenure (yrs)
                    <DecimalInput value={p.tenure} onChange={(v) => update({ tenure: v })} />
                  </label>
                </div>
              </>
            ) : (
              <>
                <div className="bto-pf-pair">
                  <label className="bto-field">
                    Bank rate % p.a.
                    <DecimalInput value={p.bankRate} onChange={(v) => update({ bankRate: v })} />
                  </label>
                  <label className="bto-field">
                    Tenure (max 30)
                    <DecimalInput
                      value={p.bankTenure}
                      max={BANK_LOAN_RULES.maxTenureYears}
                      onChange={(v) => update({ bankTenure: v })}
                    />
                  </label>
                </div>
                <p className="note">
                  Max bank loan on today&apos;s salaries: {fmt(bank.maxLoan)}
                </p>
              </>
            )}
            <label className="bto-field">
              Option fee
              <select
                value={p.optionFee}
                onChange={(e) => update({ optionFee: +e.target.value })}
              >
                <option value={1000}>$1,000 · 3-room</option>
                <option value={2000}>$2,000 · 4/5-room / 3Gen</option>
              </select>
            </label>
            <label className="bto-pf-checkbox">
              <input
                type="checkbox"
                checked={p.staggered}
                onChange={(e) => update({ staggered: e.target.checked })}
              />
              <span>Staggered downpayment (5% at AFL, 20% at keys)</span>
            </label>
          </div>
        </aside>
      </div>
    </section>
  );
}
