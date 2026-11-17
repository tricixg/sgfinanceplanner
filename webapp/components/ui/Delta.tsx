import { Icon } from "@/components/ui/Icon";

type Props = {
  /** Percentage change; null renders nothing. */
  pct: number | null;
  /** Whether an increase is good news (income) or bad news (spending). */
  upIsGood?: boolean;
  /** Optional trailing context, e.g. "vs Oct". */
  suffix?: string;
};

/** Signed percentage with a direction arrow, coloured by whether the change is favourable. */
export function Delta({ pct, upIsGood = true, suffix }: Props) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  const tone = flat ? "flat" : up === upIsGood ? "good" : "bad";
  const text = `${up && !flat ? "+" : ""}${pct.toFixed(Math.abs(pct) >= 100 ? 0 : 1)}%`;
  return (
    <span className={`delta ${tone}`}>
      {flat ? null : <Icon name={up ? "arrow-up" : "arrow-down"} />}
      {text}
      {suffix ? <span className="sr-only"> {suffix}</span> : null}
    </span>
  );
}
