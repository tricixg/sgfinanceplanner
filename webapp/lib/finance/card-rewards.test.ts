import { describe, expect, it } from "vitest";
import { getCatalogEntry } from "@/lib/cards/sg-card-catalog";
import type { CreditCard } from "@/lib/types";
import { applyCatalogEntry, recommendCardForSpend } from "./card-rewards";

describe("card-rewards", () => {
  it("applyCatalogEntry copies catalog snapshot", () => {
    const entry = getCatalogEntry("dbs-altitude-visa");
    expect(entry).toBeDefined();
    const partial = applyCatalogEntry(entry!);
    expect(partial.catalogId).toBe("dbs-altitude-visa");
    expect(partial.rewardHeadline).toContain("mpd");
  });

  it("recommends higher mpd card for foreign spend", () => {
    const cards: CreditCard[] = [
      {
        name: "DBS Altitude",
        statementDay: 1,
        paymentDueDay: 21,
        statementAmount: 0,
        catalogId: "dbs-altitude-visa",
        bank: "DBS",
        rewardType: "miles",
      },
      {
        name: "Citi PM",
        statementDay: 1,
        paymentDueDay: 21,
        statementAmount: 0,
        catalogId: "citi-premiermiles",
        bank: "Citibank",
        rewardType: "miles",
      },
    ];
    const rec = recommendCardForSpend(cards, 1000, "foreign", "miles");
    expect(rec?.cardName).toBe("DBS Altitude");
    expect(rec?.estimatedMiles).toBe(2000);
  });

  it("recommends cashback card when preference is cashback", () => {
    const cards: CreditCard[] = [
      {
        name: "Citi SMRT",
        statementDay: 1,
        paymentDueDay: 21,
        statementAmount: 0,
        catalogId: "citi-smrt",
        bank: "Citibank",
        rewardType: "cashback",
      },
      {
        name: "DBS Altitude",
        statementDay: 1,
        paymentDueDay: 21,
        statementAmount: 0,
        catalogId: "dbs-altitude-visa",
        bank: "DBS",
        rewardType: "miles",
      },
    ];
    const rec = recommendCardForSpend(cards, 500, "groceries", "cashback");
    expect(rec?.cardName).toBe("Citi SMRT");
    expect(rec?.estimatedCashback).toBeGreaterThan(0);
  });

  it("returns null when no catalog cards", () => {
    const cards: CreditCard[] = [
      { name: "Custom", statementDay: 1, paymentDueDay: 21, statementAmount: 0 },
    ];
    expect(recommendCardForSpend(cards, 100, "general")).toBeNull();
  });
});
