"use client";

import { useEffect, useRef, useState } from "react";
import { DecimalInput } from "@/components/DecimalInput";
import { CPF_AGE_BANDS } from "@/lib/oncall/calc";
import type { OncallSettings } from "@/lib/oncall/types";
import type { UserSavingsAccount } from "@/lib/savings/types";

type Props = {
  settings: OncallSettings;
  accounts: UserSavingsAccount[];
  onSave: (next: OncallSettings) => Promise<void>;
  onApplyRateToAll: () => Promise<void>;
};

/** "Daily rate" chip that opens a small settings popover; changes save on close. */
export function OncallSettingsPanel({ settings, accounts, onSave, onApplyRateToAll }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!open) setDraft(settings);
  }, [settings, open]);

  const close = async () => {
    setOpen(false);
    setConfirmAll(false);
    const next = draftRef.current;
    if (JSON.stringify(next) === JSON.stringify(settings)) return;
    setBusy(true);
    setErr("");
    try {
      await onSave(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save settings");
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) void close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close reads latest draft via ref
  }, [open]);

  const patch = (p: Partial<OncallSettings>) => setDraft((d) => ({ ...d, ...p }));

  const applyAll = async () => {
    setBusy(true);
    setErr("");
    try {
      await onSave(draftRef.current);
      await onApplyRateToAll();
      setConfirmAll(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update entries");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="oncall-settings" ref={wrapRef}>
      <button
        type="button"
        className="oncall-rate-chip"
        aria-expanded={open}
        onClick={() => (open ? void close() : setOpen(true))}
        disabled={busy}
      >
        <svg className="oncall-gear" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
        </svg>
        Daily rate <b>${settings.dailyRate.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b>
      </button>
      {err && !open ? <p className="pin-error">{err}</p> : null}
      {open ? (
        <div className="oncall-pop">
          <h3>Settings</h3>
          <label className="oncall-field">
            <span className="oncall-lbl">Daily on-call rate (S$)</span>
            <DecimalInput
              value={draft.dailyRate}
              min={0}
              step={0.01}
              onChange={(v) => patch({ dailyRate: v })}
              autoFocus
            />
            <span className="oncall-hint">
              Used for new entries. Existing entries keep the rate they were logged at.
            </span>
          </label>
          <label className="oncall-field">
            <span className="oncall-lbl">CPF age band</span>
            <select
              value={draft.cpfAgeBand}
              onChange={(e) => {
                const band = CPF_AGE_BANDS.find((b) => b.id === e.target.value);
                patch(
                  band
                    ? { cpfAgeBand: band.id, employeeCpfRate: band.employee, employerCpfRate: band.employer }
                    : { cpfAgeBand: "custom" }
                );
              }}
            >
              {CPF_AGE_BANDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
              <option value="custom">Custom rates</option>
            </select>
          </label>
          <div className="oncall-row2">
            <label className="oncall-field">
              <span className="oncall-lbl">Employee %</span>
              <DecimalInput
                value={draft.employeeCpfRate}
                min={0}
                max={100}
                step={0.5}
                disabled={!draft.cpfApplies}
                onChange={(v) => patch({ employeeCpfRate: v, cpfAgeBand: "custom" })}
              />
            </label>
            <label className="oncall-field">
              <span className="oncall-lbl">Employer %</span>
              <DecimalInput
                value={draft.employerCpfRate}
                min={0}
                max={100}
                step={0.5}
                disabled={!draft.cpfApplies}
                onChange={(v) => patch({ employerCpfRate: v, cpfAgeBand: "custom" })}
              />
            </label>
          </div>
          <label className="oncall-check">
            <input
              type="checkbox"
              checked={draft.cpfApplies}
              onChange={(e) => patch({ cpfApplies: e.target.checked })}
            />
            <span>
              CPF applies to on-call pay
              <span className="oncall-hint">
                Untick if your salary is already above the $8,000 Ordinary Wage ceiling.
              </span>
            </span>
          </label>
          {confirmAll ? (
            <div className="oncall-confirm">
              <span className="oncall-hint">
                Change every logged stretch to ${draft.dailyRate} a day? Payments already recorded keep
                their credited amount.
              </span>
              <div className="toolbar" style={{ marginTop: 0 }}>
                <button type="button" className="btn sm" disabled={busy} onClick={() => void applyAll()}>
                  {busy ? "Updating…" : "Update all"}
                </button>
                <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setConfirmAll(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn ghost sm" onClick={() => setConfirmAll(true)}>
              Use this rate for all entries
            </button>
          )}
          <hr />
          <label className="oncall-field">
            <span className="oncall-lbl">Default deposit account</span>
            <select
              value={draft.defaultAccountId ?? ""}
              onChange={(e) => patch({ defaultAccountId: e.target.value || null })}
            >
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <span className="oncall-hint">Pre-selected when you record a payment.</span>
          </label>
          {err ? <p className="pin-error">{err}</p> : null}
          <div className="toolbar" style={{ marginTop: 0, justifyContent: "flex-end" }}>
            <button type="button" className="btn sm" disabled={busy} onClick={() => void close()}>
              {busy ? "Saving…" : "Done"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
