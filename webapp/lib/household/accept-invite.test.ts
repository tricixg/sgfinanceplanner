import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { acceptPartnerInvite } from "@/lib/household/accept-invite";

const HH = "11111111-1111-4111-8111-111111111111";
const INV = "22222222-2222-4222-8222-222222222222";

const withRpc = (r: { data?: unknown; error?: { message: string } }) =>
  createFakeSupabase({}, { rpc: { accept_partner_invite: () => r } });

describe("acceptPartnerInvite", () => {
  it("joins only through accept_partner_invite and touches no table directly", async () => {
    const f = withRpc({ data: HH });
    await expect(acceptPartnerInvite(f.client, INV)).resolves.toBe(HH);
    expect(f.rpcCalls).toEqual([{ name: "accept_partner_invite", args: { invite_id: INV } }]);
    expect(f.ops).toHaveLength(0);
  });

  it("maps a full household to 409", async () => {
    await expect(acceptPartnerInvite(withRpc({ error: { message: "household_full" } }).client, INV)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("maps a missing / non-pending / not-addressed-to-you invite to 409", async () => {
    await expect(acceptPartnerInvite(withRpc({ error: { message: "invite_not_found" } }).client, INV)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("maps an unauthenticated call to 401 and other errors to 500", async () => {
    await expect(acceptPartnerInvite(withRpc({ error: { message: "not_authenticated" } }).client, INV)).rejects.toMatchObject({
      status: 401,
    });
    await expect(acceptPartnerInvite(withRpc({ error: { message: "boom" } }).client, INV)).rejects.toMatchObject({
      status: 500,
    });
  });
});
