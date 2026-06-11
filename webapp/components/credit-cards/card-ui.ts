import type { CreditCard } from "@/lib/types";

export function rewardTagClass(type?: CreditCard["rewardType"]): string {
  if (type === "miles") return "tag t-live";
  if (type === "cashback") return "tag t-soon";
  if (type === "hybrid") return "tag t-end";
  return "tag";
}

export function fmtCardDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

