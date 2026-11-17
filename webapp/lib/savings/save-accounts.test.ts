import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { saveAccountsConfig } from "@/lib/savings/save-accounts";
import type { UserSavingsAccount } from "@/lib/savings/types";

const USER = "u1";
const A1 = "11111111-1111-4111-8111-111111111111";
const A2 = "22222222-2222-4222-8222-222222222222";

const seed = () => ({
  user_savings_accounts: [
    { id: A1, user_id: USER, name: "OCBC", balance: 1000, hidden: false },
    { id: A2, user_id: USER, name: "DBS", balance: 50, hidden: false },
  ],
  savings_transactions: [{ id: "t1", account_id: A1 }],
});

const acct = (o: Partial<UserSavingsAccount>): Partial<UserSavingsAccount> => ({
  name: "x", notes: "", includeInSavings: true, sortOrder: 0, ...o,
});

describe("saveAccountsConfig", () => {
  it("does not delete accounts that are missing from the payload", async () => {
    const f = createFakeSupabase(seed());
    await saveAccountsConfig(f.client, USER, [acct({ id: A1, name: "OCBC 2" })]);
    expect(f.deletes()).toHaveLength(0);
    expect(f.table("user_savings_accounts")).toHaveLength(2);
    expect(f.table("savings_transactions")).toHaveLength(1);
  });

  it("never writes balance for an existing account", async () => {
    const f = createFakeSupabase(seed());
    await saveAccountsConfig(f.client, USER, [acct({ id: A1, balance: 999999 })]);
    expect(f.table("user_savings_accounts").find((r) => r.id === A1)!.balance).toBe(1000);
  });

  it("deletes an explicitly removed account that has no history", async () => {
    const f = createFakeSupabase(seed());
    await saveAccountsConfig(f.client, USER, [acct({ id: A1 })], [A2]);
    expect(f.table("user_savings_accounts").map((r) => r.id)).toEqual([A1]);
  });

  it("refuses to delete an account that has ledger history", async () => {
    const f = createFakeSupabase(seed());
    await expect(saveAccountsConfig(f.client, USER, [acct({ id: A2 })], [A1])).rejects.toMatchObject({ status: 409 });
    expect(f.table("user_savings_accounts")).toHaveLength(2);
    expect(f.table("savings_transactions")).toHaveLength(1);
  });

  it("errors instead of silently skipping an id that no longer exists", async () => {
    const f = createFakeSupabase(seed());
    await expect(
      saveAccountsConfig(f.client, USER, [acct({ id: "33333333-3333-4333-8333-333333333333" })])
    ).rejects.toMatchObject({ status: 409 });
  });
});
