// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const configured = vi.fn(() => true);
vi.mock("@/lib/supabase/env", () => ({ isSupabaseAuthConfigured: () => configured() }));

import { readClientSession, readSessionUserFromCookies } from "@/lib/auth/client-session";

const session = {
  access_token: "a.b.c",
  refresh_token: "r",
  user: { id: "u1", email: "me@example.com", user_metadata: { has_password: true } },
};
const b64u = (s: string) => Buffer.from(s).toString("base64url");
const encoded = `base64-${b64u(JSON.stringify(session))}`;
const NAME = "sb-abcdefgh-auth-token";

describe("readSessionUserFromCookies", () => {
  it("reads the base64url cookie @supabase/ssr writes", () => {
    expect(readSessionUserFromCookies(`x=1; ${NAME}=${encoded}; y=2`)).toEqual({
      id: "u1",
      email: "me@example.com",
      hasPassword: true,
    });
  });

  it("reassembles a chunked cookie", () => {
    const mid = Math.floor(encoded.length / 2);
    const header = `${NAME}.1=${encoded.slice(mid)}; ${NAME}.0=${encoded.slice(0, mid)}`;
    expect(readSessionUserFromCookies(header)?.id).toBe("u1");
  });

  it("reads the older plain-JSON (URL-encoded) format", () => {
    expect(readSessionUserFromCookies(`${NAME}=${encodeURIComponent(JSON.stringify(session))}`)?.id).toBe("u1");
  });

  it("handles UTF-8 in the session", () => {
    const s = { user: { id: "u2", email: "zoë@example.com", user_metadata: {} } };
    const out = readSessionUserFromCookies(`${NAME}=base64-${b64u(JSON.stringify(s))}`);
    expect(out).toEqual({ id: "u2", email: "zoë@example.com", hasPassword: false });
  });

  it.each([
    ["no cookies", ""],
    ["unrelated cookies", "a=1; b=2"],
    ["garbage base64", `${NAME}=base64-!!!not-base64`],
    ["not json", `${NAME}=hello`],
    ["json without a user", `${NAME}=base64-${b64u("{}")}`],
    ["user without an id", `${NAME}=base64-${b64u(JSON.stringify({ user: { email: "x" } }))}`],
    ["a missing chunk at the start", `${NAME}.1=abc`],
    ["a broken percent-escape", `${NAME}=%E0%A4%A`],
  ])("returns null for %s (the caller then asks the server)", (_label, header) => {
    expect(readSessionUserFromCookies(header)).toBeNull();
  });
});

describe("readClientSession", () => {
  beforeEach(() => {
    configured.mockReturnValue(true);
    document.cookie.split(";").forEach((c) => {
      const n = c.split("=")[0]?.trim();
      if (n) document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uses the cookie without calling the server", async () => {
    document.cookie = `${NAME}=${encoded}; path=/`;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(readClientSession()).resolves.toEqual({
      configured: true,
      user: { id: "u1", email: "me@example.com", hasPassword: true },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks the (verifying) server when there is no usable cookie, so it can never loop a signed-in user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ configured: true, user: { id: "u9", email: null } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    await expect(readClientSession()).resolves.toEqual({
      configured: true,
      user: { id: "u9", email: null },
    });
  });

  it("signed out when the server says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ configured: true, user: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    await expect(readClientSession()).resolves.toEqual({ configured: true, user: null });
  });

  it("reports auth as not configured without any request", async () => {
    configured.mockReturnValue(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(readClientSession()).resolves.toEqual({ configured: false, user: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces a failed server check (so RequireAuth shows its retry screen)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "down" }), { status: 500, headers: { "content-type": "application/json" } })
      )
    );
    await expect(readClientSession()).rejects.toThrow("down");
  });
});
