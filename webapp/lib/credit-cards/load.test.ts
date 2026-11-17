import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { saveCreditCards } from "@/lib/credit-cards/load";
import type { CreditCard } from "@/lib/types";

vi.mock("@/lib/financial-accounts/sync", () => ({
  syncCreditCardFinancialAccountsFromRows: vi.fn(async () => {}),
}));

const USER = "u1";
const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";

const seed = () => ({
  credit_cards: [
    { id: C1, user_id: USER, card_key: "card-a", name: "A" },
    { id: C2, user_id: USER, card_key: "card-b", name: "B" },
  ],
  card_statements: [{ id: "s1", credit_card_id: C1 }],
});

const card = (o: Partial<CreditCard>): CreditCard =>
  ({ id: "card-a", name: "A", statementDay: 1, paymentDueDay: 20, statementAmount: 0, interestRateApr: 0, ...o }) as CreditCard;

describe("saveCreditCards", () => {
  it("does not delete a card (or its statements) that is missing from the payload", async () => {
    // e.g. a failed page load left the client with [] and the user added one card
    const f = createFakeSupabase(seed());
    await saveCreditCards(f.client, USER, [card({ id: "card-new", name: "New" })]);
    expect(f.deletes()).toHaveLength(0);
    expect(f.table("credit_cards").map((r) => r.card_key).sort()).toEqual(["card-a", "card-b", "card-new"]);
    expect(f.table("card_statements")).toHaveLength(1);
  });

  it("updates an existing card in place (same row id)", async () => {
    const f = createFakeSupabase(seed());
    await saveCreditCards(f.client, USER, [card({ name: "Renamed" })]);
    const row = f.table("credit_cards").find((r) => r.card_key === "card-a")!;
    expect(row.id).toBe(C1);
    expect(row.name).toBe("Renamed");
  });

  it("deletes only explicitly removed cards that have no statements", async () => {
    const f = createFakeSupabase(seed());
    await saveCreditCards(f.client, USER, [card({})], ["card-b"]);
    expect(f.table("credit_cards").map((r) => r.card_key)).toEqual(["card-a"]);
  });

  it("refuses to delete a card that has statement history", async () => {
    const f = createFakeSupabase(seed());
    await expect(saveCreditCards(f.client, USER, [card({ id: "card-b", name: "B" })], ["card-a"])).rejects.toMatchObject({
      status: 409,
    });
    expect(f.table("credit_cards")).toHaveLength(2);
    expect(f.table("card_statements")).toHaveLength(1);
  });

  it("never deletes a card that is also in the payload", async () => {
    const f = createFakeSupabase(seed());
    await saveCreditCards(f.client, USER, [card({ id: "card-b", name: "B" })], ["card-b"]);
    expect(f.table("credit_cards").map((r) => r.card_key)).toContain("card-b");
  });
});
