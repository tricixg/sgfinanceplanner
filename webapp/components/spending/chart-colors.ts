export const SPENDING_CHART_COLORS = [
  "#c08a2e",
  "#2f5d3a",
  "#3d6b8e",
  "#b5482e",
  "#8a7be2",
  "#a89a76",
  "#6b7d6a",
  "#7a9eb5",
  "#5a4678",
  "#4a8055",
];

export function colorAt(index: number): string {
  return SPENDING_CHART_COLORS[index % SPENDING_CHART_COLORS.length]!;
}
