"use client";

type Props = {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  disabled?: boolean;
};

/** Themed include/exclude checkbox for per-item breakdown tables (see .include-checkbox-table in globals.css). */
export function IncludeCheckbox({ checked, onChange, ariaLabel, disabled }: Props) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
}
