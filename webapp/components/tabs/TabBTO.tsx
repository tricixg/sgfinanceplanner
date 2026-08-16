"use client";

import { useContext, useMemo, useState } from "react";
import type { BtoOAGrowthMode, BtoPlannerPrefs, DashboardState } from "@/lib/types";
import {
  BTO_SCHEME_DEFS,
  calcEhgFamilyGrant,
  buildBTOStages,
  computeBTO,
  cpfOAmonthly,
  enabledSchemeRows,
  formatCountdown,
  normalizeBtoPlannerPrefs,
  resolveBTOMonthOffsets,
  schemeComputedAmount,
  splitSharedBtoFields,
  type BTOSchemeId,
  type BTOStage,
  type BTOStageId,
  type BTOStageStatus,
  type SharedBtoPlannerFields,
} from "@/lib/finance";
import { fmt, fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";
import { DecimalInput } from "@/components/DecimalInput";
import { AppDataContext } from "@/contexts/app-data-contexts";
import { useHousehold } from "@/hooks/useHousehold";
import { useHouseholdBtoPlanner } from "@/hooks/useHouseholdBtoPlanner";
import { usePartnerCpf } from "@/hooks/usePartnerCpf";
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

function stageDateLabel(stage: BTOStage): string {
  if (stage.id === "application") return formatMonthLabel(stage.estimatedYm);
  if (stage.id === "mortgage") return "After keys";
  if (stage.isActual) {
    const [y, m, d] = stage.dateYmd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return `~${formatMonthLabel(stage.estimatedYm)}`;
}

function stageCountdownLabel(stage: BTOStage): string {
  if (stage.id === "application") return "Confirmed";
  if (stage.id === "mortgage") return stage.status === "active" ? "In progress" : formatCountdown(stage.daysUntil);
  return formatCountdown(stage.daysUntil);
}

/**
 * Merges the household's shared BTO fields (project name, price, grants,
 * loan terms, timeline) over the user's own personal fields (salary, OA
 * growth mode) before normalizing — shared data wins when it's loaded, so
 * both linked partners see and edit the same scenario.
 */
function resolveBtoPrefs(
  S: DashboardState,
  sharedRaw: Partial<SharedBtoPlannerFields> | null
): BtoPlannerPrefs {
  const combinedRaw = { ...(S.btoPlanner ?? {}), ...(sharedRaw ?? {}) };
  return normalizeBtoPlannerPrefs(combinedRaw, {
    monthlySal: S.monthlySal,
    oa: S.oa,
  });
}

export function TabBTO({ state: S, setState }: Props) {
  const appData = useContext(AppDataContext);
  const household = useHousehold();
  const { partnerCpf, loading: partnerCpfLoading } = usePartnerCpf();
  const { sharedBto, saveSharedBto } = useHouseholdBtoPlanner();
  const [editingSchemes, setEditingSchemes] = useState(false);
  const [editingCalc, setEditingCalc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefsDraft, setPrefsDraft] = useState<BtoPlannerPrefs>(() =>
    resolveBtoPrefs(S, sharedBto)
  );
  const editing = editingSchemes || editingCalc;
  const p = editing ? prefsDraft : resolveBtoPrefs(S, sharedBto);

  const startSchemesEdit = () => {
    setPrefsDraft(resolveBtoPrefs(S, sharedBto));
    setEditingSchemes(true);
    console.info("[TabBTO] schemes edit on");
  };

  const startCalcEdit = () => {
    setPrefsDraft(resolveBtoPrefs(S, sharedBto));
    setEditingCalc(true);
    console.info("[TabBTO] calc edit on");
  };

  const saveBtoPrefs = async () => {
    setSaving(true);
    try {
      const saves: Promise<unknown>[] = [saveSharedBto(splitSharedBtoFields(prefsDraft))];
      if (appData?.configured) {
        saves.push(appData.saveProfile({ btoPlanner: prefsDraft }));
      } else {
        setState((prev) => ({ ...prev, btoPlanner: prefsDraft }));
      }
      await Promise.all(saves);
      setEditingSchemes(false);
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

  // Partner OA: live balance from a linked household account wins when available;
  // the manual pOA field is the fallback (unpaired, or partner hasn't set a profile).
  const partnerOALive = partnerCpf?.paired ? partnerCpf.oa : null;
  const effectivePOA = partnerOALive ?? p.pOA;

  // OA growth projection: self and partner each pick their own mode independently.
  const selfMonthlyFromContrib = appData?.cpfContributions?.[0]?.oa ?? null;
  const partnerMonthlyFromContrib = partnerCpf?.paired ? partnerCpf.latestMonthlyOA : null;

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

  const tOAMonthlyResolved =
    p.tOaGrowthMode === "manual"
      ? p.tOAMonthly
      : p.tOaGrowthMode === "contributions"
        ? (selfMonthlyFromContrib ?? p.tOAMonthly)
        : cpfOAmonthly(p.tSal);
  const pOAMonthlyResolved =
    p.pOaGrowthMode === "manual"
      ? p.pOAMonthly
      : p.pOaGrowthMode === "contributions"
        ? (partnerMonthlyFromContrib ?? p.pOAMonthly)
        : cpfOAmonthly(p.pSal);

  const todayYmd = useMemo(() => sgtTodayYmd(), []);

  // Months from today to the resolved Booking/AFL/key-collection dates
  // (actual date if set, else the estimate) — keeps the CPF projection below
  // in sync with whatever the timeline is actually showing, instead of
  // re-deriving a separate schedule from monthsToAFL/yrsToKeys off the
  // application month.
  const { bookingOffsetMonths, aflOffsetMonths, kcOffsetMonths } = useMemo(
    () => resolveBTOMonthOffsets(p, todayYmd),
    [p, todayYmd]
  );

  const b = useMemo(
    () =>
      computeBTO({
        price: p.price,
        ltv: p.ltv,
        rate: p.rate,
        tenure: p.tenure,
        optionFee: p.optionFee,
        legalFee: p.legalFee,
        staggered: p.staggered,
        maxLoanEligible: p.maxLoanEligible,
        schemes: p.schemes,
        tSal: p.tSal,
        pSal: p.pSal,
        pOA: effectivePOA,
        tOA: S.oa,
        tOAMonthly: tOAMonthlyResolved,
        pOAMonthly: pOAMonthlyResolved,
        bookingOffsetMonths,
        aflOffsetMonths,
        kcOffsetMonths,
      }),
    [
      p,
      S.oa,
      effectivePOA,
      tOAMonthlyResolved,
      pOAMonthlyResolved,
      bookingOffsetMonths,
      aflOffsetMonths,
      kcOffsetMonths,
    ]
  );

  const activeSchemes = useMemo(
    () => enabledSchemeRows(p.schemes, { tSal: p.tSal, pSal: p.pSal }),
    [p.schemes, p.tSal, p.pSal]
  );

  const householdIncome = p.tSal + p.pSal;

  const toggleScheme = (id: BTOSchemeId, enabled: boolean) => {
    setPrefsDraft((prev) => {
      const base = editingSchemes ? prev : resolveBtoPrefs(S, sharedBto);
      const current = base.schemes[id] ?? { enabled: false, amountOverride: null };
      return {
        ...base,
        schemes: {
          ...base.schemes,
          [id]: { ...current, enabled },
        },
      };
    });
    if (!editingSchemes) setEditingSchemes(true);
    console.info("[TabBTO] scheme toggled", id, enabled);
  };

  const setSchemeOverride = (id: BTOSchemeId, amount: number | null) => {
    setPrefsDraft((prev) => {
      const base = editingSchemes ? prev : resolveBtoPrefs(S, sharedBto);
      const current = base.schemes[id] ?? { enabled: false, amountOverride: null };
      return {
        ...base,
        schemes: {
          ...base.schemes,
          [id]: { ...current, amountOverride: amount },
        },
      };
    });
    if (!editingSchemes) setEditingSchemes(true);
    console.info("[TabBTO] scheme amount override", id, amount);
  };

  const resetSchemeAmount = (id: BTOSchemeId) => {
    setPrefsDraft((prev) => {
      const base = editingSchemes ? prev : resolveBtoPrefs(S, sharedBto);
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

  // Key collection's downpayment is the flat 20%/15% (staggered/normal) share
  // of net price, plus any loan-eligibility shortfall folded in on top of it
  // — broken out here purely for display in the CPF-check breakdown below.
  const dpKCBase = b.netPrice * (p.staggered ? 0.2 : 0.15);
  const loanTopUp = Math.max(0, b.dpKC - dpKCBase);

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

  return (
    <section className="panel on">
      <div className="kicker" style={{ marginBottom: 6 }}>
        {p.projectName} · {formatMonthLabel(p.applicationYm)} launch
      </div>

      <div className="callout tip">
        Grants (Enhanced Housing Grant) reduce the purchase price, loan, and downpayment — type
        the amount you expect, or leave it on auto from combined household income (
        {fmt(householdIncome)}/mo). The Staggered Downpayment Scheme shifts more of the 25%
        downpayment to key collection (5% + 20% instead of 10% + 15%). CPF OA starts from your
        real balance ({fmt(S.oa)}) and your partner&apos;s
        {partnerOALive != null ? ` live balance (${fmt(partnerOALive)})` : " manually-entered balance"}
        , then grows monthly using the projection mode you choose below.
      </div>

      <div className="section-head">
        <h2>Enhanced Housing Grant</h2>
        {editingSchemes ? (
          <button
            type="button"
            className="btn sm"
            disabled={saving}
            onClick={() => void saveBtoPrefs()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startSchemesEdit}>
            Edit amounts
          </button>
        )}
      </div>

      <div className="card bto-schemes-card">
        {BTO_SCHEME_DEFS.map((def) => {
          const sel = p.schemes[def.id] ?? { enabled: false, amountOverride: null };
          const computed = schemeComputedAmount(def.id, { tSal: p.tSal, pSal: p.pSal });
          const amount = sel.enabled
            ? sel.amountOverride != null
              ? sel.amountOverride
              : computed
            : 0;
          return (
            <div
              key={def.id}
              className={`bto-scheme-row ${sel.enabled ? "on" : ""}`}
            >
              <label className="bto-scheme-check">
                <input
                  type="checkbox"
                  checked={sel.enabled}
                  onChange={(e) => toggleScheme(def.id, e.target.checked)}
                />
                <span className="bto-scheme-title">{def.name}</span>
              </label>
              <p className="bto-scheme-summary">{def.summary}</p>
              <p className="bto-scheme-eligibility">
                <b>Eligibility:</b> {def.eligibility}
              </p>
              <a
                href={def.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bto-scheme-link"
              >
                HDB / CPF reference
              </a>
              {sel.enabled && (
                <div className="bto-scheme-amt">
                  {editingSchemes ? (
                    <label>
                      Grant amount
                      <DecimalInput
                        value={amount}
                        onChange={(v) => setSchemeOverride(def.id, v)}
                      />
                      <span className="note" style={{ display: "block", marginTop: 4 }}>
                        Auto from income: {fmt(computed)} (≤$9k/mo ceiling) — type your own
                        amount to override.
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
                  ) : (
                    <>
                      <span className="k">Grant in scenario</span>
                      <span className="v">{fmt(amount)}</span>
                      <span className="note">
                        From household income {fmt(householdIncome)}/mo → auto{" "}
                        {fmt(calcEhgFamilyGrant(householdIncome))}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="minirow tot">
          <span className="k">Total grants applied</span>
          <span className="v">{fmt(b.totalGrants)}</span>
        </div>
        <div className="minirow" style={{ border: "none" }}>
          <span className="k">Net purchase price (after grants)</span>
          <span className="v">{fmt(b.netPrice)}</span>
          <span className="note" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
            List price {fmt(b.price)} − grants {fmt(b.totalGrants)}
          </span>
        </div>
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
              HDB loan LTV %
              <DecimalInput value={p.ltv} onChange={(v) => updatePrefs({ ltv: v })} />
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

          <div className="grid g3" style={{ marginTop: 16 }}>
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
              5% at AFL / 20% at key collection instead of the usual 10% / 15% — needs a
              first-timer applicant ≤30y at application with a valid HFE letter.
            </p>
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

          <p style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", marginTop: 12 }}>
            Your OA ({fmt(S.oa)}) from dashboard · combined income {fmt(householdIncome)}/mo
            drives the EHG grant when ticked
          </p>
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
          </div>
          <div className="stat">
            <div className="lbl">List price</div>
            <div className="val">{fmt(b.price)}</div>
          </div>
          <div className="stat">
            <div className="lbl">After grants</div>
            <div className="val">{fmt(b.netPrice)}</div>
            <div className="note">{activeSchemes.length} scheme(s) on</div>
          </div>
        </div>
      )}

      {!editingCalc && (
        <div className="grid g2" style={{ marginTop: 8 }}>
          <div className="stat">
            <div className="lbl">HDB loan</div>
            <div className="val">{fmt(b.loan)}</div>
            {b.loanCapped && (
              <div className="note">
                Capped to your assessed max eligible — the shortfall is topped up at key
                collection
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
        <ChartBox
          type="bar"
          data={{
            labels: b.labels,
            datasets: [
              { label: "Your OA", data: b.tSeries, backgroundColor: "#2f5d3a", stack: "a" },
              { label: "Partner OA", data: b.pSeries, backgroundColor: "#3d6b8e", stack: "a" },
              {
                label: "CPF needed for next payment",
                data: b.neededSeries,
                type: "line",
                stepped: true,
                borderColor: "#b5482e",
                borderWidth: 2.5,
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { stacked: true, grid: { display: false } },
              y: {
                stacked: true,
                grid: { color: "#e6dfca" },
                ticks: { callback: (v) => "$" + (Number(v) / 1000).toFixed(0) + "k" },
              },
            },
          }}
        />
      </div>

      <div className="split">
        <div className="card oa-gauge">
          <div className="section-lbl">AFL — CPF check</div>
          <div className="minirow">
            <span className="k">Downpayment ({p.staggered ? "5" : "10"}% of net price)</span>
            <span className="v">{fmt(b.dpAFL)}</span>
          </div>
          <div className="minirow">
            <span className="k">Option fee credit (paid at booking)</span>
            <span className="v pos">−{fmt(b.optionFee)}</span>
          </div>
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
        </div>
        <div className="card oa-gauge">
          <div className="section-lbl">Key collection — CPF check</div>
          <div className="minirow">
            <span className="k">Downpayment ({p.staggered ? "20" : "15"}% of net price)</span>
            <span className="v">{fmt(dpKCBase)}</span>
          </div>
          {loanTopUp > 0 && (
            <div className="minirow">
              <span className="k">Loan-eligibility shortfall top-up</span>
              <span className="v">+{fmt(loanTopUp)}</span>
            </div>
          )}
          <div className="minirow tot">
            <span className="k">Total due at key collection</span>
            <span className="v">{fmt(b.neededKC)}</span>
          </div>
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
              <div className="bto-stage-due">{STAGE_DUE[stage.id]}</div>
              <div className="bto-stage-amt">{stageAmount[stage.id]}</div>
              <div className="bto-stage-paid">{stagePaidFrom[stage.id]}</div>
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
    </section>
  );
}
