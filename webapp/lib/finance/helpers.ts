export const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export const fmt2 = (n: number) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const monIdx = (s: string) => {
  const [y, m] = s.split("-").map(Number);
  return y * 12 + (m - 1);
};

export const CHART_FONT = "'SF Mono',ui-monospace,Menlo,monospace";
export const CHART_COLOR = "#7d7560";
