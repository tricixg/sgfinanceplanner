// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut } }) }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseAuthConfigured: () => true }));

import { handleUnauthorized, isAppApiRequest, resetUnauthorizedGuardForTests } from "@/lib/auth/unauthorized";
import { fetchJson } from "@/lib/fetch-json";

let replace: ReturnType<typeof vi.fn>;
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetUnauthorizedGuardForTests();
  signOut.mockClear();
  replace = vi.fn();
  vi.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    pathname: "/savings",
    search: "?tab=goals",
    origin: "http://localhost",
    replace,
  } as unknown as Location);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("handleUnauthorized", () => {
  it("clears the stale local session, then sends the user to /login with a way back", async () => {
    handleUnauthorized();
    await tick();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(replace).toHaveBeenCalledWith("/login?next=%2Fsavings%3Ftab%3Dgoals");
  });

  it("redirects only once per page load, however many requests fail", async () => {
    handleUnauthorized();
    handleUnauthorized();
    handleUnauthorized();
    await tick();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("never redirects from the sign-in pages (no loop)", async () => {
    vi.spyOn(window, "location", "get").mockReturnValue({
      pathname: "/login",
      search: "",
      origin: "http://localhost",
      replace,
    } as unknown as Location);
    handleUnauthorized();
    await tick();
    expect(replace).not.toHaveBeenCalled();
  });

  it("still redirects if clearing the local session fails", async () => {
    signOut.mockRejectedValueOnce(new Error("x"));
    handleUnauthorized();
    await tick();
    expect(replace).toHaveBeenCalledTimes(1);
  });
});

describe("fetchJson 401 handling", () => {
  const respond = (status: number) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status, headers: { "content-type": "application/json" } }))
    );

  it("redirects when an app API answers 401", async () => {
    respond(401);
    await fetchJson("/api/loans");
    await tick();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("does not redirect on other statuses or for non-app URLs", async () => {
    respond(500);
    await fetchJson("/api/loans");
    respond(401);
    await fetchJson("https://example.com/api/x");
    await tick();
    expect(replace).not.toHaveBeenCalled();
  });

  it("recognises same-origin /api URLs only", () => {
    expect(isAppApiRequest("/api/state")).toBe(true);
    expect(isAppApiRequest(new URL("http://localhost/api/state"))).toBe(true);
    expect(isAppApiRequest("http://localhost/dashboard")).toBe(false);
    expect(isAppApiRequest("https://evil.test/api/state")).toBe(false);
  });
});
