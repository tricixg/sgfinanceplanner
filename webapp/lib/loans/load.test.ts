import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { saveLoans } from "@/lib/loans/load";
import type { Loan } from "@/lib/types";

vi.mock("@/lib/other-loans/load", () => ({
  loadInstalmentLoans: vi.fn(async () => []),
}));

const USER = "u1";
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";

const seed = () => ({
  loans: [
    { id: L1, user_id: USER, name: "Phone", monthly: 50 },
    { id: L2, user_id: USER, name: "Laptop", monthly: 80 },
  ],
  credit_cards: [],
});

const loan = (o: Partial<Loan>): Loan =>
  ({ name: "Phone", card: "", monthly: 50, out: 500, end: "2027-01", ...o }) as Loan;

describe("saveLoans", () => {
  it("does not delete loans that are missing from the payload", async () => {
    const f = createFakeSupabase(seed());
    await saveLoans(f.client, USER, [loan({ id: L1 })]);
    expect(f.deletes()).toHaveLength(0);
    expect(f.table("loans")).toHaveLength(2);
  });

  it("keeps and saves a plan with monthly = 0 instead of silently dropping it", async () => {
    const f = createFakeSupabase(seed());
    await saveLoans(f.client, USER, [loan({ id: L1, monthly: 0 }), loan({ name: "Zero plan", monthly: 0 })]);
    expect(f.table("loans").find((r) => r.id === L1)!.monthly).toBe(0);
    expect(f.table("loans").some((r) => r.name === "Zero plan")).toBe(true);
    expect(f.deletes()).toHaveLength(0);
  });

  it("matches by id, not by name (renaming updates the same row)", async () => {
    const f = createFakeSupabase(seed());
    await saveLoans(f.client, USER, [loan({ id: L1, name: "Phone 2" })]);
    expect(f.table("loans")).toHaveLength(2);
    expect(f.table("loans").find((r) => r.id === L1)!.name).toBe("Phone 2");
  });

  it("deletes only explicitly removed ids", async () => {
    const f = createFakeSupabase(seed());
    await saveLoans(f.client, USER, [loan({ id: L1 })], [L2]);
    expect(f.table("loans").map((r) => r.id)).toEqual([L1]);
  });
});
