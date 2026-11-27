export const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

/** 69,553 → "69.6k" for chart axes. */
export function fmtK(n: number): string {
  if (Math.abs(n) < 1000) return String(Math.round(n));
  return `${(Math.round(n / 100) / 10).toString().replace(/\.0$/, "")}k`;
}

export const fmtFee = (n: number): string => `S$${n.toFixed(2)}`;
