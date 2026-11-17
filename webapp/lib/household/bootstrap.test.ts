import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { ensureUserHousehold } from "@/lib/household/bootstrap";

const USER = "u1";
const HH = "11111111-1111-4111-8111-111111111111";

describe("ensureUserHousehold", () => {
  it("returns the existing household without creating anything", async () => {
    const f = createFakeSupabase({ household_members: [{ household_id: HH, user_id: USER }] });
    await expect(ensureUserHousehold(f.client, USER)).resolves.toBe(HH);
    expect(f.rpcCalls).toHaveLength(0);
    expect(f.ops.some((o) => o.kind === "insert")).toBe(false);
  });

  it("creates the solo household through create_solo_household(), never a direct membership insert", async () => {
    const f = createFakeSupabase({}, { rpc: { create_solo_household: () => ({ data: HH }) } });
    await expect(ensureUserHousehold(f.client, USER)).resolves.toBe(HH);
    expect(f.rpcCalls.map((c) => c.name)).toEqual(["create_solo_household"]);
    expect(f.ops.filter((o) => o.table === "household_members" && o.kind === "insert")).toHaveLength(0);
  });

  it("propagates real rpc failures instead of silently inserting", async () => {
    const f = createFakeSupabase(
      {},
      { rpc: { create_solo_household: () => ({ error: { message: "permission denied", code: "42501" } }) } }
    );
    await expect(ensureUserHousehold(f.client, USER)).rejects.toThrow("permission denied");
    expect(f.ops.filter((o) => o.kind === "insert")).toHaveLength(0);
  });

  it("falls back to the legacy insert when the function isn't installed yet (migration 066 pending)", async () => {
    const f = createFakeSupabase({});
    const id = await ensureUserHousehold(f.client, USER);
    expect(f.table("household_members")).toHaveLength(1);
    expect(f.table("household_members")[0]).toMatchObject({ household_id: id, user_id: USER, role: "owner" });
  });

  it("writes directly (no rpc) when run with the service role for another user", async () => {
    const f = createFakeSupabase({});
    await ensureUserHousehold(f.client, USER, { viaServiceRole: true });
    expect(f.rpcCalls).toHaveLength(0);
    expect(f.table("household_members")).toHaveLength(1);
  });
});
