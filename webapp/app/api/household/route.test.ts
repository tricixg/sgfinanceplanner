import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { withLatency } from "@/lib/test-utils/latency-supabase";

const USER = { id: "u1", email: "me@example.com" };
const HH = "11111111-1111-4111-8111-111111111111";
let client: unknown;

vi.mock("@/lib/auth/require-user", () => ({
  requireSessionUser: async () => ({ user: USER }),
}));
vi.mock("@/lib/supabase/authed", () => ({ createAuthedSupabaseClient: async () => client }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseAuthConfigured: () => true }));
vi.mock("@/lib/household/invite-emails", () => ({
  lookupUserEmails: async (ids: string[]) => new Map(ids.map((i) => [i, `${i}@example.com`])),
  enrichInviterEmails: async (invites: unknown[]) => invites,
}));

import { GET } from "@/app/api/household/route";

describe("GET /api/household", () => {
  beforeEach(() => {
    client = undefined;
  });

  it("returns the household, members (with emails) and invites", async () => {
    const f = createFakeSupabase({
      household_members: [
        { household_id: HH, user_id: "u1", role: "owner", joined_at: "2026-01-01" },
        { household_id: HH, user_id: "u2", role: "member", joined_at: "2026-02-01" },
      ],
      partner_invites: [
        { id: "i1", inviter_id: "u1", invitee_email: "x@example.com", status: "pending", created_at: "2026-03-01" },
      ],
    });
    client = f.client;
    const body = await (await GET()).json();
    expect(body.configured).toBe(true);
    expect(body.householdId).toBe(HH);
    expect(body.paired).toBe(true);
    expect(body.members).toEqual([
      { userId: "u1", role: "owner", joinedAt: "2026-01-01", isYou: true, email: "u1@example.com" },
      { userId: "u2", role: "member", joinedAt: "2026-02-01", isYou: false, email: "u2@example.com" },
    ]);
    expect(body.sentInvites).toHaveLength(1);
  });

  it("needs at most 2 sequential database round-trips with a household (was 4)", async () => {
    const f = createFakeSupabase({
      household_members: [{ household_id: HH, user_id: "u1", role: "owner", joined_at: "2026-01-01" }],
    });
    const timed = withLatency(f.client);
    client = timed.client;
    await GET();
    expect(timed.depth()).toBeLessThanOrEqual(2);
  });
});
