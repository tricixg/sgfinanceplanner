"use client";

import { useState } from "react";
import type { InputHTMLAttributes } from "react";

const DECIMAL_RE = /^\d*\.?\d*$/;

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(n);
}

export function parseDecimalInput(s: string): number | null {
  const t = s.trim();
  if (t === "" || t === ".") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function sanitizeDraft(raw: string): string {
  let s = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  }
  return s;
}

function clamp(n: number, min?: number, max?: number): number {
  let out = n;
  if (min != null) out = Math.max(min, out);
  if (max != null) out = Math.min(max, out);
  return out;
}

function roundToStep(n: number, step?: number): number {
  if (step == null || !Number.isFinite(step) || step <= 0) return n;
  return Math.round(n / step) * step;
}

type CommonProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "step" | "inputMode"
>;

/** Numeric field without browser spinners; supports decimals with `.` */
export function DecimalInput({
  value,
  onChange,
  min,
  max,
  step,
  onBlur,
  onFocus,
  className,
  ...rest
}: CommonProps & {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  /** Round committed values to this increment (e.g. 0.01 for cents). */
  step?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const display = editing ? draft : formatNum(value);

  const commit = (raw: string) => {
    const parsed = parseDecimalInput(raw);
    const n = roundToStep(clamp(parsed ?? 0, min, max), step);
    onChange(n);
    setDraft(null);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={["decimal-input", className].filter(Boolean).join(" ")}
      value={display}
      onFocus={(e) => {
        setDraft(formatNum(value));
        onFocus?.(e);
      }}
      onChange={(e) => {
        const s = sanitizeDraft(e.target.value);
        if (s !== "" && !DECIMAL_RE.test(s)) return;
        setDraft(s);
        const parsed = parseDecimalInput(s);
        if (parsed !== null) {
          onChange(roundToStep(clamp(parsed, min, max), step));
        } else if (s === "" || s === ".") {
          onChange(min != null && min > 0 ? min : 0);
        }
      }}
      onBlur={(e) => {
        commit(draft ?? e.target.value);
        onBlur?.(e);
      }}
    />
  );
}

/** Same as DecimalInput but controlled with a string (forms that validate on submit). */
export function DecimalTextInput({
  value,
  onChange,
  className,
  ...rest
}: CommonProps & {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={["decimal-input", className].filter(Boolean).join(" ")}
      value={value}
      onChange={(e) => {
        const s = sanitizeDraft(e.target.value);
        if (s === "" || DECIMAL_RE.test(s)) onChange(s);
      }}
    />
  );
}

/** @deprecated use DecimalInput */
export const NumInput = DecimalInput;
