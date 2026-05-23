import { describe, expect, it } from "vitest";
import {
  getAllCardStatementBreakdowns,
  migrateCardLoanLinks,
  resolveCardIdForLabel,
} from "./card-linking";
import { DEFAULTS } from "./defaults";

describe("card-linking", () => {
  it("auto-maps legacy loan card labels to credit cards", () => {
    const { creditCards, loans } = migrateCardLoanLinks(DEFAULTS);
    const altitudeId = creditCards.find((c) => c.catalogId === "dbs-altitude-visa")?.id;
    const mariId = creditCards.find((c) => c.catalogId === "maribank-card")?.id;
    const wwId = creditCards.find((c) => c.catalogId === "dbs-ww-mastercard")?.id;

    expect(altitudeId).toBeTruthy();
    expect(resolveCardIdForLabel("Altitude", creditCards)).toBe(altitudeId);
    expect(resolveCardIdForLabel("MariBank", creditCards)).toBe(mariId);
    expect(resolveCardIdForLabel("WW Mastercard", creditCards)).toBe(wwId);

    const altitudeLoans = loans.filter((l) => l.cardId === altitudeId);
    expect(altitudeLoans.length).toBeGreaterThanOrEqual(4);
    const bt = DEFAULTS.otherLoans?.find((l) => l.name.includes("Woman"));
    expect(bt?.sourceCreditCardId).toBe(wwId);
  });

  it("splits statement into revolving spend and instalments", () => {
    const state = migrateCardLoanLinks({
      creditCards: [
        {
          id: "ww",
          name: "DBS Woman's World",
          statementDay: 10,
          paymentDueDay: 7,
          statementAmount: 1000,
        },
      ],
      loans: [
        {
          name: "IL 12M",
          card: "WW",
          cardId: "ww",
          monthly: 170.63,
          out: 853.19,
          end: "2027-12",
        },
      ],
    });

    const [breakdown] = getAllCardStatementBreakdowns(state);
    expect(breakdown.instalmentOnStatement).toBe(170.63);
    expect(breakdown.revolvingSpend).toBeCloseTo(829.37, 2);
    expect(breakdown.statementAmount).toBe(1000);
  });

  it("adds outstanding when card tick is on", () => {
    const state = migrateCardLoanLinks({
      creditCards: [
        {
          id: "ww",
          name: "DBS Woman's World",
          statementDay: 10,
          paymentDueDay: 7,
          statementAmount: 1000,
          includeOutstandingOnStatement: true,
        },
      ],
      loans: [],
      otherLoans: [
        {
          name: "BT plan",
          loanType: "balance_transfer",
          principal: 622.58,
          outstanding: 622.58,
          interestRateApr: 0,
          feesPaid: 0,
          amountPaid: 0,
          dueDate: "2027-12-31",
          sourceCreditCardId: "ww",
        },
      ],
    });

    expect(state.creditCards[0].includeOutstandingOnStatement).toBe(true);
  });
});
