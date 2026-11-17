"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BtoOAGrowthMode, BtoPlannerPrefs, DashboardState } from "@/lib/types";
import {
  BTO_SCHEME_DEFS,
  addMonthsYm,
  buildBTOStages,
  btoLoanTerms,
  computeBTO,
  enabledSchemeRows,
  formatCountdown,
  resolveBTOMilestoneDates,
  resolveBTOMonthOffsets,
  totalLoanLoadForMonth,
  resolveBtoOAMonthly,
  schemeComputedAmount,
  type BTOSchemeId,
  type BTOStage,
  type BTOStageId,
  type BTOStageStatus,
} from "@/lib/finance";
import { fmt, fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import { DecimalInput } from "@/components/DecimalInput";
import { BtoOATimelineChart } from "@/components/bto/BtoOATimelineChart";
import { BtoPaymentsPanel } from "@/components/bto/BtoPaymentsPanel";
import { btoProjectionAdjustments, reconcileBtoPayments } from "@/lib/finance/bto-reconcile";
import type { CpfBtoStage } from "@/lib/cpf/types";
import { useBtoPlannerData } from "@/hooks/useBtoPlannerData";
import { sgtTodayYmd } from "@/lib/time/sgt";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

const GROWTH_MODE_LABEL: Record<BtoOAGrowthMode, string> = {
  salary: "Salary est.",
  manual: "Manual $/mo",
  contributions: "From contributions",
};

const STAGE_TITLE: Record<BTOStageId, string> = {
  application: "Application",
  booking: "Booking",
  afl: "Sign AFL",
  keys: "Key collection",
  mortgage: "Mortgage",
};

const STAGE_DUE: Record<BTOStageId, string> = {
  application: "Submit BTO application",
  booking: "Option fee",
  afl: "Downpayment + BSD + legal fee",
  keys: "Remaining downpayment",
  mortgage: "Monthly instalment",
};

const STAGE_STATUS_LABEL: Record<BTOStageStatus, string> = {
  done: "Done",
  next: "Next up",
  upcoming: "Upcoming",
  active: "In progress",
};

const STAGE_DATE_FIELD: Partial<
  Record<BTOStageId, "bookingDateActual" | "aflDateActual" | "keysDateActual">
> = {
  booking: "bookingDateActual",
  afl: "aflDateActual",
  keys: "keysDateActual",
};

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

function stageDateLabel(stage: BTOStage): string {
  if (stage.id === "application") return formatMonthLabel(stage.estimatedYm);
  if (stage.id === "mortgage") return "After keys";
  if (stage.isActual) return formatYmdLabel(stage.dateYmd);
  return `~${formatMonthLabel(stage.estimatedYm)}`;
}

function stageCountdownLabel(stage: BTOStage): string {
  if (stage.id === "application") return "Confirmed";
  if (stage.id === "mortgage") return stage.status === "active" ? "In progress" : formatCountdown(stage.daysUntil);
  return formatCountdown(stage.daysUntil);
}

export function TabBTO({ state: S, setState }: Props) {
  const {
    household,
    partnerCpf,
    partnerCpfLoading,
    sharedBtoLoading,
    savedPrefs,
    savePrefs,
    partnerOALive,
    selfMonthlyFromContrib,
    partnerMonthlyFromContrib,
    btoPayments,
  } = useBtoPlannerData(S, setState);
  // Household pairing, the partner's live CPF, and the shared household plan
  // all load asynchronously after the page's core data — rendering before
  // they resolve would show numbers from stale fallbacks (this account's own
  // last-saved snapshot of the shared plan, a manually-entered partner OA)
  // that then visibly jump once the real synced values arrive. Wait for all
  // three so the first real paint is already correct. The extra paired-but-no-
  // partnerCpf-yet check closes a one-render gap right after household data
  // resolves, before usePartnerCpf's own effect has had a chance to flip its
  // loading flag back on.
  const dataReady =
    !household.loading &&
    !partnerCpfLoading &&
    !sharedBtoLoading &&
    !(household.paired && partnerCpf == null);
  const [editingCalc, setEditingCalc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefsDraft, setPrefsDraft] = useState<BtoPlannerPrefs>(savedPrefs);
  const editing = editingCalc;
  const p = editing ? prefsDraft : savedPrefs;

  const startCalcEdit = () => {
    setPrefsDraft(savedPrefs);
    setEditingCalc(true);
    console.info("[TabBTO] calc edit on");
  };

  const saveBtoPrefs = async () => {
    setSaving(true);
    try {
      await savePrefs(prefsDraft);
      setEditingCalc(false);
      console.info("[TabBTO] planner prefs saved");
    } catch (e) {
      console.error("[TabBTO] save failed", e);
    } finally {
      setSaving(false);
    }
  };

  const updatePrefs = (patch: Partial<BtoPlannerPrefs>) => {
    setPrefsDraft((prev) => {
      const next = { ...prev, ...patch };
      console.info("[TabBTO] updated prefs draft", patch);
      return next;
    });
  };

  const effectivePOA = partnerOALive ?? p.pOA;

  // Logged BTO payments feed the projection: grant credits still sitting in
  // OA are taken back out (the plan already credits them against the bills),
  // and bills already paid aren't drawn again.
  const payAdj = useMemo(() => btoProjectionAdjustments(btoPayments), [btoPayments]);
  const projSelfOA = Math.max(0, S.oa - payAdj.unspentGrantSelf);
  const projPartnerOA =
    partnerOALive != null ? Math.max(0, effectivePOA - payAdj.unspentGrantPartner) : effectivePOA;

  // Status of the live partner-CPF pipeline, surfaced next to the growth-mode picker
  // so it's visible whether real data is actually coming in or it's falling back to manual.
  const partnerStatus = useMemo(() => {
    if (!household.configured) {
      return {
        tag: "t-end",
        label: "Unavailable",
        detail: "Household linking isn't available right now.",
      };
    }
    if (household.loading) {
      return { tag: "t-soon", label: "Checking…", detail: "Looking up your linked partner." };
    }
    if (!household.paired) {
      return {
        tag: "t-end",
        label: "Not linked",
        detail: "Link your partner on the Me tab to pull their real CPF balance automatically.",
      };
    }
    if (partnerCpfLoading) {
      return { tag: "t-soon", label: "Loading…", detail: "Fetching your partner's CPF data." };
    }
    if (!partnerCpf) {
      return {
        tag: "t-end",
        label: "Error",
        detail: "Couldn't load partner CPF data — using manual entry for now.",
      };
    }
    if (partnerCpf.oa == null) {
      return {
        tag: "t-soon",
        label: "No balance set",
        detail: `Linked to ${partnerCpf.partnerEmail ?? "your partner"}, but they haven't set a CPF balance yet — using manual entry.`,
      };
    }
    return {
      tag: "t-live",
      label: "Live",
      detail: `From ${partnerCpf.partnerEmail ?? "your partner"} — OA ${fmt(partnerCpf.oa)}${
        partnerCpf.latestContributionMonth
          ? `, contributions logged through ${formatMonthLabel(partnerCpf.latestContributionMonth)}`
          : ", no contributions logged yet"
      }.`,
    };
  }, [household.configured, household.loading, household.paired, partnerCpfLoading, partnerCpf]);

  // OA growth projection: self and partner each pick their own mode independently.
  const { tOAMonthly: tOAMonthlyResolved, pOAMonthly: pOAMonthlyResolved } = resolveBtoOAMonthly(
    p,
    { self: selfMonthlyFromContrib, partner: partnerMonthlyFromContrib }
  );

  const todayYmd = useMemo(() => sgtTodayYmd(), []);
  const todayYm = todayYmd.slice(0, 7);

  // Months from today to the resolved Booking/AFL/key-collection dates
  // (actual date if set, else the estimate) — keeps the CPF projection below
  // in sync with whatever the timeline is actually showing, instead of
  // re-deriving a separate schedule from monthsToAFL/yrsToKeys off the
  // application month.
  const { bookingOffsetMonths, aflOffsetMonths, kcOffsetMonths, latestKcOffsetMonths } =
    useMemo(() => resolveBTOMonthOffsets(p, todayYmd), [p, todayYmd]);

  // HDB or bank loan at key collection (chosen in the price finder); a bank
  // loan's cap depends on debt repayments still running at that point.
  const loanTerms = useMemo(() => {
    const keysYm = resolveBTOMilestoneDates(p).keysYmd.slice(0, 7);
    return btoLoanTerms(p, {
      otherDebtMonthly: totalLoanLoadForMonth(S.loans, S.otherLoans ?? [], keysYm),
    });
  }, [p, S.loans, S.otherLoans]);

  const b = useMemo(
    () =>
      computeBTO({
        price: p.price,
        rate: loanTerms.rate,
        tenure: loanTerms.tenure,
        optionFee: p.optionFee,
        legalFee: p.legalFee,
        staggered: p.staggered,
        maxLoanEligible: loanTerms.maxLoanEligible,
        minCashPct: loanTerms.minCashPct,
        schemes: p.schemes,
        tSal: p.tSal,
        pSal: p.pSal,
        pOA: projPartnerOA,
        tOA: projSelfOA,
        tOAMonthly: tOAMonthlyResolved,
        pOAMonthly: pOAMonthlyResolved,
        bookingOffsetMonths,
        aflOffsetMonths,
        kcOffsetMonths,
        latestKcOffsetMonths,
        alreadyPaidAFL: payAdj.alreadyPaidAFL,
        alreadyPaidKC: payAdj.alreadyPaidKC,
      }),
    [
      p,
      loanTerms,
      projSelfOA,
      projPartnerOA,
      payAdj,
      tOAMonthlyResolved,
      pOAMonthlyResolved,
      bookingOffsetMonths,
      aflOffsetMonths,
      kcOffsetMonths,
      latestKcOffsetMonths,
    ]
  );

  const activeSchemes = useMemo(
    () => enabledSchemeRows(p.schemes, { tSal: p.tSal, pSal: p.pSal }),
    [p.schemes, p.tSal, p.pSal]
  );

  const toggleScheme = (id: BTOSchemeId, enabled: boolean) => {
    setPrefsDraft((prev) => {
      const base = prev;
      const current = base.schemes[id] ?? { enabled: false, amountOverride: null };
      return {
        ...base,
        schemes: {
          ...base.schemes,
          [id]: { ...current, enabled },
        },
      };
    });
    console.info("[TabBTO] scheme toggled", id, enabled);
  };

  const setSchemeOverride = (id: BTOSchemeId, amount: number | null) => {
    setPrefsDraft((prev) => {
      const base = prev;
      const current = base.schemes[id] ?? { enabled: false, amountOverride: null };
      return {
        ...base,
        schemes: {
          ...base.schemes,
          [id]: { ...current, amountOverride: amount },
        },
      };
    });
    console.info("[TabBTO] scheme amount override", id, amount);
  };

  const resetSchemeAmount = (id: BTOSchemeId) => {
    setPrefsDraft((prev) => {
      const base = prev;
      const current = base.schemes[id] ?? { enabled: false, amountOverride: null };
      return {
        ...base,
        schemes: {
          ...base.schemes,
          [id]: { ...current, amountOverride: null },
        },
      };
    });
    console.info("[TabBTO] scheme amount reset", id);
  };

  const stages = useMemo(() => buildBTOStages(p, todayYmd), [p, todayYmd]);
  const reconcile = useMemo(() => reconcileBtoPayments(b, btoPayments), [b, btoPayments]);
  const applicationStage = stages.find((s) => s.id === "application")!;
  const keysStage = stages.find((s) => s.id === "keys")!;

  const nextStage = stages.find((s) => s.status === "next");
  const currentPhaseLabel = !nextStage
    ? "Keys collected — mortgage in progress"
    : nextStage.id === "booking"
      ? "Application submitted — waiting for your booking appointment"
      : nextStage.id === "afl"
        ? "Flat booked — waiting to sign the Agreement for Lease"
        : "Agreement for Lease signed — waiting for key collection";

  const currentCombinedOA = S.oa + effectivePOA;

  // Latest key collection check — only meaningful when the latest date is set
  // and actually later than the resolved key collection date.
  const latestKcLabel = p.keysDateLatest ? formatYmdLabel(p.keysDateLatest) : "";
  const showLatestKc = Boolean(p.keysDateLatest) && b.latestKcOffset > kcOffsetMonths;
  const kcCoveredLabel =
    b.kcCoveredOffset != null
      ? formatMonthLabel(addMonthsYm(todayYmd.slice(0, 7), b.kcCoveredOffset))
      : "";

  const stageAmount: Record<BTOStageId, string> = {
    application: "—",
    booking: fmt(b.optionFee),
    afl: fmt(b.neededAFL),
    keys: fmt(b.neededKC),
    mortgage: fmt(b.mortgage) + "/mo",
  };
  const stagePaidFrom: Record<BTOStageId, string> = {
    application: "—",
    booking: "Cash",
    afl: b.cashAFL > 0 ? `CPF ${fmt(b.cpfUsedAFL)} + cash ${fmt(b.cashAFL)}` : "CPF OA",
    keys: b.cashKC > 0 ? `CPF ${fmt(b.cpfUsedKC)} + cash ${fmt(b.cashKC)}` : "CPF OA",
    mortgage: "CPF OA",
  };
  const stageProgress: Partial<
    Record<BTOStageId, { pct: number; needed: number; projected: number }>
  > = {
    afl: {
      pct: b.neededAFL > 0 ? Math.min(100, (currentCombinedOA / b.neededAFL) * 100) : 100,
      needed: b.neededAFL,
      projected: b.cpfAvailAFL,
    },
    keys: {
      pct: b.neededKC > 0 ? Math.min(100, (currentCombinedOA / b.neededKC) * 100) : 100,
      needed: b.neededKC,
      projected: b.cpfAvailKC,
    },
  };

  const stageById = (id: BTOStageId) => stages.find((s) => s.id === id)!;
  const payStageDates: Record<CpfBtoStage, string> = {
    booking: stageDateLabel(stageById("booking")),
    afl: stageDateLabel(stageById("afl")),
    keys: stageDateLabel(stageById("keys")),
    mortgage: "After key collection",
  };
  const payStageReached: Record<CpfBtoStage, boolean> = {
    booking: stageById("booking").status === "done",
    afl: stageById("afl").status === "done",
    keys: stageById("keys").status === "done",
    mortgage: stageById("mortgage").status === "active",
  };
  const payNextStage: CpfBtoStage =
    nextStage && nextStage.id !== "application" ? (nextStage.id as CpfBtoStage) : "mortgage";
  const paidAFLLogged = b.neededAFL - b.dueAFL;
  const paidKCLogged = b.neededKC - b.dueKC;

  if (!dataReady) {
    return <p className="loading">Loading your saved BTO plan…</p>;
  }

  return (
    <section className="panel on">
      <div className="bto-page-head">
        <div className="kicker">
          {p.projectName} · {formatMonthLabel(p.applicationYm)} launch
        </div>
        <Link href="/bto/price-finder" className="btn ghost sm">
          Price finder
        </Link>
      </div>

      <div className="callout tip">
        Grants are credited to CPF OA before AFL and go toward the downpayment; they don&apos;t
        reduce the loan or BSD. Projected OA starts from your balance ({fmt(S.oa)}) and your
        partner&apos;s{partnerOALive != null ? ` (${fmt(partnerOALive)}, live)` : ""}, growing as set
        in Edit.
      </div>

      <div className="grid g4" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="lbl">Selected price</div>
          <div className="val">{fmt(b.price)}</div>
        </div>
        <div className="stat cash">
          <div className="lbl">Total cash needed</div>
          <div className="val">{fmt(b.totalCash)}</div>
        </div>
        <div className="stat cpf">
          <div className="lbl">Total CPF OA needed</div>
          <div className="val">{fmt(b.totalCpf)}</div>
        </div>
        <div className={`stat status ${b.dpOK ? "" : "warn"}`}>
          <div className="lbl">CPF OA at key collection</div>
          <div className={`val ${b.dpOK ? "pos" : "neg"}`}>
            {b.dpOK ? `Covered (+${fmt(b.balAfterKC)})` : `Shortfall ${fmt(b.cashKC)}`}
          </div>
          {!b.dpOK && showLatestKc && (
            <div className="note">
              {b.latestKcOK
                ? `Covered by latest keys (${latestKcLabel}) from ~${kcCoveredLabel}`
                : `Still ${fmt(b.cashLatestKC)} short by latest keys (${latestKcLabel})`}
            </div>
          )}
        </div>
      </div>

      <div className="section-head">
        <h2>Flat &amp; financing</h2>
        {editingCalc ? (
          <button
            type="button"
            className="btn sm"
            disabled={saving}
            onClick={() => void saveBtoPrefs()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startCalcEdit}>
            Edit
          </button>
        )}
      </div>

      {editingCalc ? (
        <div className="card">
          <label className="bto-field">
            Project name
            <input
              type="text"
              value={p.projectName}
              onChange={(e) => updatePrefs({ projectName: e.target.value })}
            />
          </label>
          <label className="bto-field" style={{ marginTop: 12 }}>
            Flat price (list)
            <DecimalInput value={p.price} onChange={(v) => updatePrefs({ price: v })} />
          </label>
          <input
            type="range"
            className="budget-slider"
            min={400000}
            max={900000}
            step={1000}
            value={p.price}
            onChange={(e) => updatePrefs({ price: +e.target.value })}
          />

          <div className="grid g3" style={{ marginTop: 16 }}>
            <label className="bto-field">
              Option fee (cash at booking)
              <select
                value={p.optionFee}
                onChange={(e) => updatePrefs({ optionFee: +e.target.value })}
              >
                <option value={1000}>$1,000 — 3-room</option>
                <option value={2000}>$2,000 — 4/5-room / 3Gen</option>
              </select>
            </label>
            <label className="bto-field">
              Loan interest % p.a.
              <DecimalInput value={p.rate} onChange={(v) => updatePrefs({ rate: v })} />
            </label>
            <label className="bto-field">
              Tenure (years)
              <DecimalInput value={p.tenure} onChange={(v) => updatePrefs({ tenure: v })} />
            </label>
            <label className="bto-field">
              Max loan eligible (from your AIP/HLE letter, 0 = not set)
              <DecimalInput
                value={p.maxLoanEligible}
                onChange={(v) => updatePrefs({ maxLoanEligible: v })}
              />
            </label>
            <label className="bto-field">
              BTO application month
              <input
                type="month"
                value={p.applicationYm}
                onChange={(e) => {
                  updatePrefs({ applicationYm: e.target.value });
                  console.info("[TabBTO] application month", e.target.value);
                }}
              />
            </label>
            <label className="bto-field">
              Months: booking → Agreement for Lease
              <DecimalInput
                value={p.monthsToAFL}
                min={1}
                max={9}
                onChange={(v) => updatePrefs({ monthsToAFL: v })}
              />
              <span className="note">HDB requires signing within 9 months of booking</span>
            </label>
            <label className="bto-field">
              Legal fee at AFL (est.)
              <DecimalInput value={p.legalFee} onChange={(v) => updatePrefs({ legalFee: v })} />
            </label>
            <label className="bto-field">
              Years to keys
              <DecimalInput
                value={p.yrsToKeys}
                onChange={(v) => updatePrefs({ yrsToKeys: v })}
              />
            </label>
            <label className="bto-field">
              Queue number
              <DecimalInput
                value={p.queueNumber}
                onChange={(v) => updatePrefs({ queueNumber: v })}
              />
            </label>
            <label className="bto-field">
              Flat supply (queue out of)
              <DecimalInput
                value={p.queueTotal}
                onChange={(v) => updatePrefs({ queueTotal: v })}
              />
            </label>
          </div>

          <div className="grid g4" style={{ marginTop: 16 }}>
            <label className="bto-field">
              Actual booking date
              <input
                type="date"
                value={p.bookingDateActual}
                onChange={(e) => updatePrefs({ bookingDateActual: e.target.value })}
              />
              <span className="note">Leave blank to use the estimate</span>
            </label>
            <label className="bto-field">
              Actual AFL date
              <input
                type="date"
                value={p.aflDateActual}
                onChange={(e) => updatePrefs({ aflDateActual: e.target.value })}
              />
              <span className="note">Leave blank to use the estimate</span>
            </label>
            <label className="bto-field">
              Actual key collection date
              <input
                type="date"
                value={p.keysDateActual}
                onChange={(e) => updatePrefs({ keysDateActual: e.target.value })}
              />
              <span className="note">Leave blank to use the estimate</span>
            </label>
            <label className="bto-field">
              Latest key collection date
              <input
                type="date"
                value={p.keysDateLatest}
                onChange={(e) => updatePrefs({ keysDateLatest: e.target.value })}
              />
              <span className="note">
                HDB&apos;s latest date, to check if OA catches up
              </span>
            </label>
          </div>

          <div className="card" style={{ marginTop: 16, marginBottom: 0 }}>
            <label className="bto-scheme-check">
              <input
                type="checkbox"
                checked={p.staggered}
                onChange={(e) => updatePrefs({ staggered: e.target.checked })}
              />
              <span className="bto-scheme-title">Staggered Downpayment Scheme</span>
            </label>
            <p className="bto-scheme-summary">
              5% at AFL and 20% at keys, instead of 10% and 15%. First-timer aged 30 or under with
              an HFE letter.
            </p>
          </div>

          <div className="card" style={{ marginTop: 16, marginBottom: 0 }}>
            <div className="section-lbl">Housing grants</div>
            {BTO_SCHEME_DEFS.map((def) => {
              const sel = p.schemes[def.id] ?? { enabled: false, amountOverride: null };
              const computed = schemeComputedAmount(def.id, { tSal: p.tSal, pSal: p.pSal });
              const amount = sel.amountOverride != null ? sel.amountOverride : computed;
              return (
                <div key={def.id} style={{ marginTop: 8 }}>
                  <label className="bto-scheme-check">
                    <input
                      type="checkbox"
                      checked={sel.enabled}
                      onChange={(e) => toggleScheme(def.id, e.target.checked)}
                    />
                    <span className="bto-scheme-title">{def.name}</span>
                  </label>
                  <a
                    href={def.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bto-scheme-link"
                    title={def.eligibility}
                  >
                    Eligibility
                  </a>
                  {sel.enabled && (
                    <label className="bto-field" style={{ marginTop: 8, maxWidth: 320 }}>
                      Grant amount
                      <DecimalInput value={amount} onChange={(v) => setSchemeOverride(def.id, v)} />
                      <span className="note">
                        Auto from income: {fmt(computed)}. Type your HFE letter amount to override.
                      </span>
                      {sel.amountOverride != null && sel.amountOverride !== computed && (
                        <button
                          type="button"
                          className="btn ghost sm"
                          style={{ marginTop: 6 }}
                          onClick={() => resetSchemeAmount(def.id)}
                        >
                          Reset to calculated
                        </button>
                      )}
                    </label>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid g2" style={{ marginTop: 16 }}>
            <label className="bto-field">
              Your salary / mo
              <DecimalInput value={p.tSal} onChange={(v) => updatePrefs({ tSal: v })} />
            </label>
            <label className="bto-field">
              Partner salary / mo
              <DecimalInput value={p.pSal} onChange={(v) => updatePrefs({ pSal: v })} />
            </label>
          </div>

          <label className="bto-field" style={{ marginTop: 16 }}>
            Partner CPF OA now
            {partnerOALive != null ? (
              <div className="bto-live-value">{fmt(partnerOALive)}</div>
            ) : (
              <DecimalInput value={p.pOA} onChange={(v) => updatePrefs({ pOA: v })} />
            )}
          </label>
          {partnerOALive != null ? (
            <p className="note">
              Using {partnerCpf?.partnerEmail ?? "your partner"}&apos;s live CPF balance from
              their linked account.
            </p>
          ) : household.paired ? (
            <p className="note">
              Partner is linked but hasn&apos;t set a CPF balance yet — using manual entry above.
            </p>
          ) : (
            <p className="note">
              Link your partner on the Me tab to pull their real CPF balance automatically.
            </p>
          )}

          <div className="grid g2" style={{ marginTop: 16 }}>
            <div>
              <label className="bto-field">
                Your OA growth projection
                <div className="bto-mode-segment">
                  {(["salary", "manual", "contributions"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={p.tOaGrowthMode === mode ? "active" : ""}
                      onClick={() => updatePrefs({ tOaGrowthMode: mode })}
                    >
                      {GROWTH_MODE_LABEL[mode]}
                    </button>
                  ))}
                </div>
              </label>
              {p.tOaGrowthMode === "manual" && (
                <DecimalInput
                  value={p.tOAMonthly}
                  onChange={(v) => updatePrefs({ tOAMonthly: v })}
                  style={{ marginTop: 8 }}
                />
              )}
              {p.tOaGrowthMode === "contributions" && (
                <p className="note" style={{ marginTop: 8 }}>
                  {selfMonthlyFromContrib != null
                    ? `Using your last logged contribution (${fmt(selfMonthlyFromContrib)}/mo).`
                    : "No contribution logged yet — log one on the CPF tab. Using your manual estimate for now."}
                </p>
              )}
            </div>
            <div>
              <div className="bto-partner-status">
                <span className={`tag ${partnerStatus.tag}`}>{partnerStatus.label}</span>
                <span>Partner CPF data</span>
              </div>
              <p className="note" style={{ marginTop: 4, marginBottom: 12 }}>
                {partnerStatus.detail}
              </p>
              <label className="bto-field">
                Partner&apos;s OA growth projection
                <div className="bto-mode-segment">
                  {(["salary", "manual", "contributions"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={p.pOaGrowthMode === mode ? "active" : ""}
                      onClick={() => updatePrefs({ pOaGrowthMode: mode })}
                    >
                      {GROWTH_MODE_LABEL[mode]}
                    </button>
                  ))}
                </div>
              </label>
              {p.pOaGrowthMode === "manual" && (
                <DecimalInput
                  value={p.pOAMonthly}
                  onChange={(v) => updatePrefs({ pOAMonthly: v })}
                  style={{ marginTop: 8 }}
                />
              )}
              {p.pOaGrowthMode === "contributions" && (
                <p className="note" style={{ marginTop: 8 }}>
                  {partnerMonthlyFromContrib != null
                    ? `Using partner's last logged contribution (${fmt(partnerMonthlyFromContrib)}/mo).`
                    : "Partner hasn't logged a contribution — using their manual estimate for now."}
                </p>
              )}
            </div>
          </div>

        </div>
      ) : (
        <div className="grid g4">
          <div className="stat">
            <div className="lbl">Application</div>
            <div className="val">{stageDateLabel(applicationStage)}</div>
          </div>
          <div className="stat">
            <div className="lbl">Est. key collection</div>
            <div className="val">{stageDateLabel(keysStage)}</div>
            {latestKcLabel && <div className="note">Latest: {latestKcLabel}</div>}
          </div>
          <div className="stat">
            <div className="lbl">List price</div>
            <div className="val">{fmt(b.price)}</div>
          </div>
          <div className="stat">
            <div className="lbl">Grants credited to CPF</div>
            <div className="val">{fmt(b.totalGrants)}</div>
            <div className="note">{activeSchemes.length > 0 ? "Change in Edit" : "None set · add in Edit"}</div>
          </div>
        </div>
      )}

      {!editingCalc && (
        <div className="grid g2" style={{ marginTop: 8 }}>
          <div className="stat">
            <div className="lbl">{p.loanAtKeys === "bank" ? "Bank loan" : "HDB loan"}</div>
            <div className="val">{fmt(b.loan)}</div>
            {b.loanCapped && (
              <div className="note">
                {p.loanAtKeys === "bank"
                  ? "Capped by what your income allows at key collection — the shortfall is topped up then"
                  : "Capped to your assessed max eligible — the shortfall is topped up at key collection"}
              </div>
            )}
            {p.loanAtKeys === "bank" && (
              <div className="note">
                At {p.bankRate}% over {loanTerms.tenure} yrs, with at least 5% of the price in
                cash. Change in the price finder.
              </div>
            )}
          </div>
          <div className="stat warn">
            <div className="lbl">Monthly mortgage</div>
            <div className="val">{fmt(b.mortgage)}</div>
          </div>
        </div>
      )}

      <div className="grid g3" style={{ marginTop: 12 }}>
        <div className="stat accent">
          <div className="lbl">Downpayment at AFL</div>
          <div className="val">{fmt(b.dpAFL)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Downpayment at keys</div>
          <div className="val">{fmt(b.dpKC)}</div>
        </div>
        <div className="stat">
          <div className="lbl">BSD (on net price)</div>
          <div className="val">{fmt2(b.bsd)}</div>
        </div>
      </div>

      <div className="card">
        <div className="bto-pf-chart-head">
          <span className="section-lbl">CPF OA timeline</span>
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
            { month: bookingOffsetMonths, label: "Booking", tone: "muted" },
            { month: aflOffsetMonths, label: "AFL", tone: "ink" },
            { month: kcOffsetMonths, label: "Est. keys", tone: "ink" },
            ...(showLatestKc
              ? [{ month: latestKcOffsetMonths, label: "Latest keys", tone: "gold" as const }]
              : []),
          ]}
          covered={
            b.kcCoveredOffset != null
              ? { month: b.kcCoveredOffset, due: b.neededKC, label: `Covers keys bill · ${kcCoveredLabel}` }
              : null
          }
        />
        <p className="note">Hover (or tap) a month on the line for your/partner split that month.</p>
      </div>

      <div className="split">
        <div className="card oa-gauge">
          <div className="section-lbl">AFL — CPF check</div>
          <div className="minirow">
            <span className="k">Downpayment ({p.staggered ? "5" : "10"}% of price)</span>
            <span className="v">{fmt(b.dpAFL)}</span>
          </div>
          <div className="minirow">
            <span className="k">Option fee credit (paid at booking)</span>
            <span className="v pos">−{fmt(b.optionFee)}</span>
          </div>
          {b.grantAppliedAFL > 0 && (
            <div className="minirow">
              <span className="k">CPF housing grant credit</span>
              <span className="v pos">−{fmt(b.grantAppliedAFL)}</span>
            </div>
          )}
          <div className="minirow">
            <span className="k">Buyer&apos;s Stamp Duty</span>
            <span className="v">+{fmt(b.bsd)}</span>
          </div>
          <div className="minirow">
            <span className="k">Legal fee</span>
            <span className="v">+{fmt(b.legalFee)}</span>
          </div>
          <div className="minirow tot">
            <span className="k">Total due at AFL</span>
            <span className="v">{fmt(b.neededAFL)}</span>
          </div>
          {paidAFLLogged > 0 && (
            <>
              <div className="minirow">
                <span className="k">Already paid (logged)</span>
                <span className="v pos">−{fmt(paidAFLLogged)}</span>
              </div>
              <div className="minirow tot">
                <span className="k">Still to pay at AFL</span>
                <span className="v">{fmt(b.dueAFL)}</span>
              </div>
            </>
          )}
          <div className="minirow" style={{ marginTop: 10 }}>
            <span className="k">Pooled CPF OA projected</span>
            <span className="v">{fmt(b.cpfAvailAFL)}</span>
          </div>
          <div className="minirow">
            <span className="k">Used for this payment</span>
            <span className="v">{fmt(b.cpfUsedAFL)}</span>
          </div>
          <div className="minirow tot">
            <span className="k">
              {b.cashAFL > 0 ? "Cash top-up needed" : "Remaining after payment"}
            </span>
            <span className={`v ${b.cashAFL > 0 ? "neg" : "pos"}`}>
              {fmt(b.cashAFL > 0 ? b.cashAFL : b.balAfterAFL)}
            </span>
          </div>
          {b.grantAppliedAFL > 0 && (
            <p className="note" style={{ marginTop: 6 }}>
              The grant is credited against this bill, so projected OA above is your own savings.
            </p>
          )}
        </div>
        <div className="card oa-gauge">
          <div className="section-lbl">Key collection — CPF check</div>
          <div className="minirow">
            <span className="k">Downpayment ({p.staggered ? "20" : "15"}% of price)</span>
            <span className="v">{fmt(b.dpKCBase)}</span>
          </div>
          {b.loanShortfall > 0 && (
            <div className="minirow">
              <span className="k">Loan-eligibility shortfall top-up</span>
              <span className="v">+{fmt(b.loanShortfall)}</span>
            </div>
          )}
          {b.grantAppliedKC > 0 && (
            <div className="minirow">
              <span className="k">CPF housing grant credit (leftover from AFL)</span>
              <span className="v pos">−{fmt(b.grantAppliedKC)}</span>
            </div>
          )}
          <div className="minirow tot">
            <span className="k">Total due at key collection</span>
            <span className="v">{fmt(b.neededKC)}</span>
          </div>
          {paidKCLogged > 0 && (
            <>
              <div className="minirow">
                <span className="k">Already paid (logged)</span>
                <span className="v pos">−{fmt(paidKCLogged)}</span>
              </div>
              <div className="minirow tot">
                <span className="k">Still to pay at key collection</span>
                <span className="v">{fmt(b.dueKC)}</span>
              </div>
            </>
          )}
          {b.totalGrants > 0 && b.grantAppliedKC === 0 && (
            <p className="note" style={{ marginTop: 6 }}>
              Grant fully used at AFL; none left for this payment.
            </p>
          )}
          <div className="minirow" style={{ marginTop: 10 }}>
            <span className="k">Pooled CPF OA projected</span>
            <span className="v">{fmt(b.cpfAvailKC)}</span>
          </div>
          <div className="minirow">
            <span className="k">Used for this payment</span>
            <span className="v">{fmt(b.cpfUsedKC)}</span>
          </div>
          <div className="minirow tot">
            <span className="k">{b.cashKC > 0 ? "Cash shortfall" : "Surplus after payment"}</span>
            <span className={`v ${b.cashKC > 0 ? "neg" : "pos"}`}>
              {fmt(b.cashKC > 0 ? b.cashKC : b.balAfterKC)}
            </span>
          </div>
          {showLatestKc && (
            <>
              <div className="minirow" style={{ marginTop: 10 }}>
                <span className="k">Pooled CPF OA by latest keys ({latestKcLabel})</span>
                <span className="v">{fmt(b.cpfAvailLatestKC)}</span>
              </div>
              <div className="minirow tot">
                <span className="k">
                  {b.latestKcOK ? "Surplus at latest keys" : "Shortfall at latest keys"}
                </span>
                <span className={`v ${b.latestKcOK ? "pos" : "neg"}`}>
                  {fmt(b.latestKcOK ? b.cpfAvailLatestKC - b.neededKC : b.cashLatestKC)}
                </span>
              </div>
              <p className="note" style={{ marginTop: 6 }}>
                {b.dpOK
                  ? "Already covered at the estimated date."
                  : b.latestKcOK
                    ? `OA covers the ${fmt(b.cashKC)} shortfall from ~${kcCoveredLabel}.`
                    : `${fmt(b.cashLatestKC)} would still need cash.`}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-lbl">Mortgage — CPF check</div>
        <div className="minirow">
          <span className="k">Combined OA inflow / mo</span>
          <span className="v pos">{fmt(b.oaInflow)}</span>
        </div>
        <div className="minirow">
          <span className="k">Mortgage / mo</span>
          <span className="v neg">{fmt(b.mortgage)}</span>
        </div>
        <div className="minirow tot">
          <span className="k">Surplus / shortfall</span>
          <span className={`v ${b.mortSurplus >= 0 ? "pos" : "neg"}`}>
            {b.mortSurplus >= 0 ? fmt(b.mortSurplus) : fmt(-b.mortSurplus)}
          </span>
        </div>
      </div>

      <div className="callout">
        <span className="ico" style={{ color: "var(--gold)" }}>
          Verdict
        </span>
        {b.verdict}
        {!b.dpOK && showLatestKc && (
          <>
            {" "}
            {b.latestKcOK
              ? `If keys come at the latest date (${latestKcLabel}), CPF OA catches up by ~${kcCoveredLabel} and covers it.`
              : `Even at the latest key collection date (${latestKcLabel}), ${fmt(b.cashLatestKC)} would still be short.`}
          </>
        )}
      </div>

      <div className="card">
        <div className="minirow">
          <span className="k">Buyer&apos;s Stamp Duty</span>
          <span className="v">{fmt(b.bsd)}</span>
        </div>
        <div className="minirow tot">
          <span className="k">Indicative extras (BSD + legal + option fee)</span>
          <span className="v">{fmt(b.extras)}</span>
        </div>
      </div>

      <h2>Timeline</h2>
      <p className="note" style={{ marginBottom: 10 }}>
        You are here: {currentPhaseLabel}
      </p>
      <div className="bto-scroll-timeline">
        {stages.map((stage) => {
          const progress = stageProgress[stage.id];
          const dateFieldKey = STAGE_DATE_FIELD[stage.id];
          return (
            <div key={stage.id} className={`bto-stage-card ${stage.status}`}>
              <div className="bto-stage-status-badge">{STAGE_STATUS_LABEL[stage.status]}</div>
              <div className="bto-stage-title">{STAGE_TITLE[stage.id]}</div>
              {stage.id === "application" && p.queueNumber > 0 && p.queueTotal > 0 && (
                <div className="bto-stage-queue">
                  Queue {p.queueNumber} / {p.queueTotal}
                </div>
              )}
              <div className="bto-stage-date">
                {stageDateLabel(stage)}
                {!stage.isActual && stage.id !== "application" && stage.id !== "mortgage"
                  ? " (est.)"
                  : ""}
              </div>
              <div className="bto-stage-countdown">{stageCountdownLabel(stage)}</div>
              {stage.id === "keys" && latestKcLabel && (
                <div className="bto-stage-queue">Latest: {latestKcLabel}</div>
              )}
              <div className="bto-stage-due">{STAGE_DUE[stage.id]}</div>
              <div className="bto-stage-amt">{stageAmount[stage.id]}</div>
              <div className="bto-stage-paid">{stagePaidFrom[stage.id]}</div>
              {(stage.id === "booking" || stage.id === "afl" || stage.id === "keys") &&
                (() => {
                  const r = reconcile[stage.id];
                  return (
                    <a href="#payments" className={`bto-pay-chip ${r.status === "not_started" ? "none" : r.status}`}>
                      Paid {fmt(r.paid)} / {fmt(r.expected)}
                    </a>
                  );
                })()}
              {progress && (
                <>
                  <div className="bto-stage-progress-lbl">
                    CPF have now {fmt(currentCombinedOA)} / needed {fmt(progress.needed)}
                  </div>
                  <div className="category-budget-progress-wrap" style={{ marginTop: 4 }}>
                    <div
                      className="category-budget-progress"
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                  <div className="bto-stage-progress-lbl">
                    Projected by then:{" "}
                    <span className={progress.projected >= progress.needed ? "pos" : "neg"}>
                      {fmt(progress.projected)}
                    </span>
                  </div>
                </>
              )}
              {editingCalc && dateFieldKey && (
                <label className="bto-stage-date-input">
                  Actual date
                  <input
                    type="date"
                    value={p[dateFieldKey]}
                    onChange={(e) => updatePrefs({ [dateFieldKey]: e.target.value })}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>

      <BtoPaymentsPanel
        reconcile={reconcile}
        rows={btoPayments}
        stageDates={payStageDates}
        stageReached={payStageReached}
        nextStage={payNextStage}
        paired={household.paired}
        tenureMonths={Math.round(loanTerms.tenure * 12)}
      />
    </section>
  );
}
