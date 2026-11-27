"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SubmitKey } from "@/lib/api/client-request-id";
import type { MilesAction } from "@/lib/miles/ledger";
import {
  expiryDateLabel,
  monthFromYmd,
  monthLabel,
  monthToInput,
  quarterEnd,
  quarterLabel,
  type MonthIndex,
} from "@/lib/miles/months";
import { availableAt, balancesAt, bucketFor, uobBalancePreview } from "@/lib/miles/plan";
import {
  CARD_PROGRAMS,
  MILES_PROGRAMS,
  PROGRAM_ORDER,
  type CardProgram,
  type MilesProgram,
} from "@/lib/miles/programs";
import { avail, type MilesLot } from "@/lib/miles/types";
import { errorMessage } from "@/lib/ui/notify";
import { fmt, fmtFee } from "@/components/miles/format";

type Props = {
  lots: MilesLot[];
  now: MonthIndex;
  mutate: (action: MilesAction) => Promise<void>;
  /** Disabled while the miles failed to load (the list isn't the real data). */
  disabled?: boolean;
};

type Tab = "earned" | "convert" | "redeem";

/** "12,500" → 12500; "" → null. */
function parseAmount(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function useSave(mutate: Props["mutate"]) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const run = async (action: MilesAction, doneText: string): Promise<boolean> => {
    setBusy(true);
    setError("");
    setDone("");
    try {
      await mutate(action);
      setDone(doneText);
      return true;
    } catch (e) {
      console.error("[MilesLogPanel] save failed", action.action, e);
      setError(errorMessage(e, "Couldn't save that. Please try again."));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, done, run, clear: () => (setError(""), setDone("")) };
}

function Status({ error, done }: { error: string; done: string }) {
  if (error) return <p className="mt-form-error" role="alert">{error}</p>;
  if (done) return <p className="mt-form-done" role="status">{done}</p>;
  return null;
}

/** Log points earned, a conversion, or a redemption. */
export function MilesLogPanel({ lots, now, mutate, disabled }: Props) {
  const [tab, setTab] = useState<Tab>("earned");
  return (
    <div className="card mt-logbox">
      <SegmentedControl<Tab>
        label="What to log"
        value={tab}
        onChange={setTab}
        options={[
          { value: "earned", label: "Points earned" },
          { value: "convert", label: "Conversion" },
          { value: "redeem", label: "Redemption" },
        ]}
      />
      {tab === "earned" ? <EarnedForm lots={lots} now={now} mutate={mutate} disabled={disabled} /> : null}
      {tab === "convert" ? <ConvertForm lots={lots} now={now} mutate={mutate} disabled={disabled} /> : null}
      {tab === "redeem" ? <RedeemForm lots={lots} now={now} mutate={mutate} disabled={disabled} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function EarnedForm({ lots, now, mutate, disabled }: Props) {
  const [program, setProgram] = useState<MilesProgram>("krisflyer");
  const [earned, setEarned] = useState(monthToInput(now));
  const [expiry, setExpiry] = useState("");
  const [amount, setAmount] = useState("");
  const [uobMode, setUobMode] = useState<"balance" | "expiry">("balance");
  const keyRef = useRef(new SubmitKey());
  const save = useSave(mutate);

  const rule = MILES_PROGRAMS[program];
  const earnedM = monthFromYmd(earned);
  const wwDefault = monthToInput(quarterEnd(now) + 12);
  const krisflyerExpiry = earnedM !== null ? earnedM + 36 : null;
  // KrisFlyer expiry follows the earned month until changed by hand.
  const expiryValue = program === "krisflyer" ? expiry || (krisflyerExpiry !== null ? monthToInput(krisflyerExpiry) : "") : program === "dbs_womans_world" ? expiry || wwDefault : expiry;
  const expiryM = monthFromYmd(expiryValue);
  const bucket = program === "dbs_womans_world" && expiryM !== null ? bucketFor(lots, expiryM) : undefined;
  const uobTracked = availableAt(lots, "uob", now);
  const altBalance = balancesAt(lots, now).dbs_altitude;

  // Woman's World and UOB balance start from the current figure so you only overwrite it.
  const amountValue =
    amount !== "" ? amount : program === "dbs_womans_world" && bucket ? String(avail(bucket)) : program === "uob" && uobMode === "balance" ? String(uobTracked) : "";
  const n = parseAmount(amountValue);

  const switchProgram = (p: MilesProgram) => {
    setProgram(p);
    setExpiry("");
    setAmount("");
    save.clear();
  };

  let hint = "";
  if (program === "krisflyer") {
    hint = earnedM !== null ? `Earned ${monthLabel(earnedM)}, so these miles expire ${expiryDateLabel(earnedM + 36)}. Change the expiry if KrisFlyer shows a different date.` : "";
  } else if (program === "dbs_womans_world") {
    hint = expiryM === null ? "" : `${bucket ? `Replaces the ${fmt(avail(bucket))} points expiring ${expiryDateLabel(expiryM)} with what the DBS app shows now.` : `Adds a line for points expiring ${expiryDateLabel(expiryM)}.`} Enter 0 to remove that month.`;
  } else if (program === "dbs_altitude") {
    hint = `Altitude points don't expire. Your balance goes from ${fmt(altBalance)} to ${fmt(altBalance + Math.max(0, n ?? 0))}.`;
  } else if (uobMode === "balance") {
    const pv = uobBalancePreview(lots, n ?? uobTracked, now);
    hint =
      pv.delta > 0
        ? `${fmt(pv.delta)} new UNI$ since your last update. They're dated today, so they go into ${quarterLabel(pv.quarterFrom)} and expire ${expiryDateLabel(pv.expiry)}.`
        : pv.delta < 0
          ? `That's ${fmt(-pv.delta)} fewer than the ${fmt(pv.tracked)} tracked. They come off your oldest UNI$ first. If you converted, log it on the Conversion tab instead so the miles are counted.`
          : `Tracked now: ${fmt(pv.tracked)} UNI$. Type the balance the UOB app shows. Any increase is dated today and put in today's quarter.`;
  } else {
    hint = "For setting up: enter an amount and the expiry date the UOB app shows for it. After that, just update the balance.";
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (n === null || n < 0) return;
    let action: MilesAction;
    let doneText: string;
    if (program === "krisflyer") {
      if (!earned || n <= 0) return;
      action = { action: "addLot", program, amount: n, earnedMonth: earned, expiryMonth: expiryValue || null };
      doneText = `Added ${fmt(n)} KrisFlyer miles.`;
    } else if (program === "dbs_womans_world") {
      if (!expiryValue) return;
      action = { action: "setExpiryBucket", expiryMonth: expiryValue, amount: n };
      doneText = n === 0 ? `Removed the points expiring ${expiryM !== null ? monthLabel(expiryM) : ""}.` : `Saved ${fmt(n)} points expiring ${expiryM !== null ? monthLabel(expiryM) : ""}.`;
    } else if (program === "dbs_altitude") {
      if (n <= 0) return;
      action = { action: "addLot", program, amount: n };
      doneText = `Added ${fmt(n)} Altitude points.`;
    } else if (uobMode === "balance") {
      action = { action: "setUobBalance", balance: n };
      doneText = `UOB balance updated to ${fmt(n)} UNI$.`;
    } else {
      if (!expiryValue || n <= 0) return;
      action = { action: "addLot", program, amount: n, expiryMonth: expiryValue };
      doneText = `Added ${fmt(n)} UNI$.`;
    }
    if (action.action === "addLot") action.clientRequestId = keyRef.current.keyFor(action);
    if (await save.run(action, doneText)) {
      keyRef.current.reset();
      setAmount("");
      setExpiry("");
    }
  };

  const showEarned = program === "krisflyer";
  const showExpiry = program === "krisflyer" || program === "dbs_womans_world" || (program === "uob" && uobMode === "expiry");
  const amountLabel =
    program === "krisflyer" ? "Miles earned" : program === "dbs_womans_world" ? "Points expiring that month" : program === "dbs_altitude" ? "New points to add" : uobMode === "balance" ? "UNI$ balance in the UOB app" : "UNI$";
  const expiryLabel = program === "dbs_womans_world" ? "Expiry month (from the DBS app)" : program === "uob" ? "Expires (from the UOB app)" : "Expires";
  const buttonLabel =
    program === "krisflyer" ? "Add miles" : program === "dbs_womans_world" ? "Update" : program === "uob" && uobMode === "balance" ? "Update balance" : "Add points";

  return (
    <form className="mt-form" onSubmit={(e) => void submit(e)}>
      <div className="mt-form-row">
        <label className="mt-field">
          Programme
          <select value={program} onChange={(e) => switchProgram(e.target.value as MilesProgram)} disabled={disabled}>
            {PROGRAM_ORDER.map((p) => (
              <option key={p} value={p}>
                {MILES_PROGRAMS[p].name}
              </option>
            ))}
          </select>
        </label>
        {program === "uob" ? (
          <div className="mt-field">
            How
            <SegmentedControl<"balance" | "expiry">
              label="How to log UOB"
              value={uobMode}
              onChange={(v) => {
                setUobMode(v);
                setAmount("");
                setExpiry("");
                save.clear();
              }}
              options={[
                { value: "balance", label: "Balance" },
                { value: "expiry", label: "With expiry date" },
              ]}
            />
          </div>
        ) : null}
        {showEarned ? (
          <label className="mt-field">
            Earned
            <input type="month" value={earned} max={monthToInput(now)} onChange={(e) => (setEarned(e.target.value), setExpiry(""))} disabled={disabled} />
          </label>
        ) : null}
        {showExpiry ? (
          <label className="mt-field">
            {expiryLabel}
            <input
              type="month"
              value={expiryValue}
              onChange={(e) => (setExpiry(e.target.value), program === "dbs_womans_world" ? setAmount("") : null)}
              disabled={disabled}
            />
          </label>
        ) : null}
        <label className="mt-field">
          {amountLabel}
          <input
            type="text"
            inputMode="numeric"
            value={amountValue}
            placeholder="0"
            onChange={(e) => setAmount(e.target.value)}
            disabled={disabled}
          />
        </label>
        <button type="submit" className="btn" disabled={disabled || save.busy || n === null}>
          {save.busy ? "Saving…" : buttonLabel}
        </button>
      </div>
      <p className="mt-hint">{rule.name}: {hint}</p>
      <Status error={save.error} done={save.done} />
    </form>
  );
}

// ---------------------------------------------------------------------------

function ConvertForm({ lots, now, mutate, disabled }: Props) {
  const [program, setProgram] = useState<CardProgram>("dbs_womans_world");
  const [month, setMonth] = useState(monthToInput(now));
  const [points, setPoints] = useState("");
  const keyRef = useRef(new SubmitKey());
  const save = useSave(mutate);
  const rule = MILES_PROGRAMS[program];
  const m = monthFromYmd(month) ?? now;
  const available = useMemo(() => availableAt(lots, program, m), [lots, program, m]);
  const largest = Math.floor(available / rule.block) * rule.block;
  const value = points !== "" ? points : largest ? String(largest) : "";
  const n = parseAmount(value);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!n || n <= 0) return;
    const action: MilesAction = { action: "convert", program, month, points: n };
    action.clientRequestId = keyRef.current.keyFor(action);
    if (await save.run(action, `Converted ${fmt(n)} ${rule.short} points into ${fmt(n * rule.ratio)} KrisFlyer miles.`)) {
      keyRef.current.reset();
      setPoints("");
    }
  };

  return (
    <form className="mt-form" onSubmit={(e) => void submit(e)}>
      <div className="mt-form-row">
        <label className="mt-field">
          From card
          <select value={program} onChange={(e) => (setProgram(e.target.value as CardProgram), setPoints(""), save.clear())} disabled={disabled}>
            {CARD_PROGRAMS.map((p) => (
              <option key={p} value={p}>
                {MILES_PROGRAMS[p].name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-field">
          Month converted
          <input type="month" value={month} max={monthToInput(now)} onChange={(e) => (setMonth(e.target.value), setPoints(""))} disabled={disabled} />
        </label>
        <label className="mt-field">
          Points to convert
          <input type="text" inputMode="numeric" value={value} placeholder="5000" onChange={(e) => setPoints(e.target.value)} disabled={disabled} />
        </label>
        <button type="submit" className="btn" disabled={disabled || save.busy || !n}>
          {save.busy ? "Saving…" : "Log conversion"}
        </button>
      </div>
      <p className="mt-hint">
        {largest === 0
          ? `You have ${fmt(available)} ${rule.unit} on ${rule.name} in ${monthLabel(m)}. The smallest conversion is ${fmt(rule.block)}.`
          : `${fmt(available)} ${rule.unit} available in ${monthLabel(m)}.${n ? ` ${fmt(n)} points become ${fmt(n * rule.ratio)} KrisFlyer miles, valid until ${expiryDateLabel(m + 36)}. Fee ${fmtFee(rule.fee)}. Your oldest points are used first.` : ""}`}
      </p>
      <Status error={save.error} done={save.done} />
    </form>
  );
}

// ---------------------------------------------------------------------------

function RedeemForm({ lots, now, mutate, disabled }: Props) {
  const [month, setMonth] = useState(monthToInput(now));
  const [miles, setMiles] = useState("");
  const [what, setWhat] = useState("");
  const keyRef = useRef(new SubmitKey());
  const save = useSave(mutate);
  const m = monthFromYmd(month) ?? now;
  const available = availableAt(lots, "krisflyer", m);
  const n = parseAmount(miles);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!n || n <= 0) return;
    const action: MilesAction = { action: "redeem", month, miles: n, description: what.trim() };
    action.clientRequestId = keyRef.current.keyFor(action);
    if (await save.run(action, `Logged ${fmt(n)} KrisFlyer miles${what.trim() ? ` for ${what.trim()}` : ""}.`)) {
      keyRef.current.reset();
      setMiles("");
      setWhat("");
    }
  };

  return (
    <form className="mt-form" onSubmit={(e) => void submit(e)}>
      <div className="mt-form-row">
        <label className="mt-field">
          Month booked
          <input type="month" value={month} max={monthToInput(now)} onChange={(e) => setMonth(e.target.value)} disabled={disabled} />
        </label>
        <label className="mt-field">
          KrisFlyer miles used
          <input type="text" inputMode="numeric" value={miles} placeholder="0" onChange={(e) => setMiles(e.target.value)} disabled={disabled} />
        </label>
        <label className="mt-field grow">
          What for (optional)
          <input type="text" value={what} maxLength={200} placeholder="e.g. SIN to Tokyo, Business, return" onChange={(e) => setWhat(e.target.value)} disabled={disabled} />
        </label>
        <button type="submit" className="btn" disabled={disabled || save.busy || !n}>
          {save.busy ? "Saving…" : "Log redemption"}
        </button>
      </div>
      <p className="mt-hint">
        {fmt(available)} KrisFlyer miles available in {monthLabel(m)}.{" "}
        {n && n > available ? (
          <span className="neg">That&apos;s {fmt(n - available)} more than you have. Log a conversion first.</span>
        ) : (
          "Your oldest miles are used first, the same way KrisFlyer does it."
        )}
      </p>
      <Status error={save.error} done={save.done} />
    </form>
  );
}
