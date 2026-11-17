"use client";

type Option<T extends string> = {
  value: T;
  label: string;
  /** Shorter label shown on narrow screens. */
  compact?: string;
};

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  className?: string;
  /** Stretch segments to fill the row on narrow screens. */
  fill?: boolean;
};

/** iOS-style segmented control; scrolls horizontally if it can't fit. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  fill,
}: Props<T>) {
  return (
    <div className={`seg-scroll ${fill ? "seg-fill" : ""} ${className ?? ""}`}>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            aria-label={o.compact && o.compact !== o.label ? o.label : undefined}
            onClick={() => onChange(o.value)}
          >
            {o.compact && o.compact !== o.label ? (
              <>
                <span className="seg-full">{o.label}</span>
                <span className="seg-compact">{o.compact}</span>
              </>
            ) : (
              o.label
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
