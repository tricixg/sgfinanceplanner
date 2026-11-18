import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";

const USER = { id: "u1", email: "me@example.com" };
const HH = "11111111-1111-4111-8111-111111111111";
let client: unknown;

vi.mock("@/lib/auth/require-user", () => ({
  requireSessionUser: async () => ({ user: USER }),
}));
vi.mock("@/lib/supabase/authed", () => ({ createAuthedSupabaseClient: async () => client }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseAuthConfigured: () => true }));

import { GET, PUT } from "@/app/api/state/route";

describe("GET /api/state", () => {
  beforeEach(() => {
    client = undefined;
  });

  it("returns prefs for a migrated user with a single read — no household bootstrap", async () => {
    const f = createFakeSupabase({
      dashboard_state: [
        { user_id: "u1", data: { prefs: { theme: "dark" }, _migrated_v2: true }, updated_at: "2026-05-01" },
      ],
    });
    client = f.client;
    const body = await (await GET()).json();
    expect(body.data).toEqual({ prefs: { theme: "dark" }, _migrated_v2: true });
    expect(body.source).toBe("database");
    expect(f.ops).toHaveLength(1);
    expect(f.ops[0].table).toBe("dashboard_state");
    expect(f.rpcCalls).toHaveLength(0);
  });

  it("makes no writes and creates no household for a first-time user with no saved state", async () => {
    const f = createFakeSupabase({}, { rpc: { create_solo_household: () => ({ data: HH }) } });
    client = f.client;
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.source).toBe("defaults");
    expect(body.data.prefs).toEqual({});
    // One read of dashboard_state; nothing written, no household bootstrap.
    expect(f.ops.map((o) => `${o.kind}:${o.table}`)).toEqual(["select:dashboard_state"]);
    expect(f.rpcCalls).toHaveLength(0);
  });

  it("concurrent first loads all succeed and still write nothing", async () => {
    const f = createFakeSupabase({}, { rpc: { create_solo_household: () => ({ data: HH }) } });
    client = f.client;
    const responses = await Promise.all(Array.from({ length: 6 }, () => GET()));
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(f.ops.filter((o) => o.kind !== "select")).toHaveLength(0);
    expect(f.rpcCalls).toHaveLength(0);
  });

  it("runs the legacy migration only for a full pre-v2 snapshot that is not yet migrated", async () => {
    const legacy = {
      monthlySal: 5000,
      loans: [],
      goals: [],
      holdings: [],
      budget: [],
      accounts: [],
      ilpPolicies: [],
      prefs: { theme: "dark" },
    };
    const f = createFakeSupabase(
      { dashboard_state: [{ user_id: "u1", data: legacy, updated_at: "2026-01-01" }] },
      { rpc: { create_solo_household: () => ({ data: HH }) } }
    );
    client = f.client;
    const first = await (await GET()).json();
    expect(first.migrated).toBe(true);
    expect(first.data).toEqual({ prefs: { theme: "dark" }, _migrated_v2: true });
    // The household is created here because the migration needs it...
    expect(f.rpcCalls.map((c) => c.name)).toEqual(["create_solo_household"]);
    // ...and the row is now the slim v2 shape.
    expect(f.table("dashboard_state")[0]!.data).toEqual({ prefs: { theme: "dark" }, _migrated_v2: true });

    // Reading again is a plain read: no migration, no household, no writes.
    f.ops.length = 0;
    f.rpcCalls.length = 0;
    const second = await (await GET()).json();
    expect(second.migrated).toBeUndefined();
    expect(second.data).toEqual({ prefs: { theme: "dark" }, _migrated_v2: true });
    expect(f.ops.map((o) => `${o.kind}:${o.table}`)).toEqual(["select:dashboard_state"]);
    expect(f.rpcCalls).toHaveLength(0);
  });

  it("saving prefs (PUT) writes only dashboard_state — no household bootstrap either", async () => {
    const f = createFakeSupabase({}, { rpc: { create_solo_household: () => ({ data: HH }) } });
    client = f.client;
    const res = await PUT(
      new Request("http://localhost/api/state", {
        method: "PUT",
        body: JSON.stringify({ data: { prefs: { theme: "dark" } } }),
      }) as never
    );
    expect(res.status).toBe(200);
    expect(f.rpcCalls).toHaveLength(0);
    expect(f.ops.filter((o) => o.kind !== "select").map((o) => o.table)).toEqual(["dashboard_state"]);
  });
});
