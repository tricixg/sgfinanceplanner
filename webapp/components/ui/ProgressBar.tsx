type Props = {
  /** 0–1; values above 1 render full and switch to the "over" tone. */
  value: number;
  tone?: "default" | "warn" | "over";
  size?: "sm" | "md";
  label?: string;
};

export function ProgressBar({ value, tone, size = "md", label }: Props) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const resolved = tone ?? (safe > 1 ? "over" : "default");
  const pct = Math.min(100, safe * 100);
  return (
    <div
      className={`progress ${resolved === "default" ? "" : resolved} ${size === "sm" ? "sm" : ""}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
