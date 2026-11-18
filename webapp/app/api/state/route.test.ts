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

import { GET } from "@/app/api/state/route";

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

  it("still creates the household for a first-time user", async () => {
    const f = createFakeSupabase({}, { rpc: { create_solo_household: () => ({ data: HH }) } });
    client = f.client;
    const body = await (await GET()).json();
    expect(body.source).toBe("defaults");
    expect(f.rpcCalls.map((c) => c.name)).toEqual(["create_solo_household"]);
  });
});
