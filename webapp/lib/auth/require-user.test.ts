import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeTrustedUser, TRUSTED_USER_HEADER } from "@/lib/auth/trusted-header";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const headerValues = new Map<string, string>();
const getUser = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerValues.get(k.toLowerCase()) ?? null }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

import { requireSessionUser } from "@/lib/auth/require-user";

const env = { ...process.env };

beforeEach(() => {
  headerValues.clear();
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "placeholder";
  process.env.AUTH_HEADER_SECRET = SECRET;
  delete process.env.AUTH_BYPASS_DEV;
});
afterEach(() => {
  process.env = { ...env };
});

describe("requireSessionUser identity header (SEC-003)", () => {
  it("does not trust a forged unsigned header; falls back to getUser and returns 401", async () => {
    headerValues.set(TRUSTED_USER_HEADER, JSON.stringify({ id: "victim-id" }));
    const result = await requireSessionUser();
    expect("response" in result && result.response.status).toBe(401);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("does not trust a header with a wrong signature", async () => {
    const good = await encodeTrustedUser({ id: "victim-id" }, "attacker-guess");
    headerValues.set(TRUSTED_USER_HEADER, good);
    const result = await requireSessionUser();
    expect("response" in result && result.response.status).toBe(401);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("trusts a validly signed header without a network call", async () => {
    headerValues.set(
      TRUSTED_USER_HEADER,
      await encodeTrustedUser({ id: "u1", email: "a@example.com" }, SECRET)
    );
    const result = await requireSessionUser();
    expect("user" in result && result.user.id).toBe("u1");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("fails closed to a live check when AUTH_HEADER_SECRET is missing", async () => {
    headerValues.set(TRUSTED_USER_HEADER, await encodeTrustedUser({ id: "u1" }, SECRET));
    delete process.env.AUTH_HEADER_SECRET;
    const result = await requireSessionUser();
    expect("response" in result && result.response.status).toBe(401);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("uses the live session user when there is no header", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "live-user" } }, error: null });
    const result = await requireSessionUser();
    expect("user" in result && result.user.id).toBe("live-user");
  });
});
