import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRUSTED_USER_HEADER, decodeTrustedUser } from "@/lib/auth/trusted-header";
import {
  isPublicPagePath,
  loginRedirectPath,
  requiresSignInRedirect,
  userFromClaims,
} from "@/lib/auth/proxy-session";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const getClaims = vi.fn();
const getUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims, getUser } }),
}));

import { updateSession } from "@/lib/supabase/middleware";

const env = { ...process.env };
beforeEach(() => {
  getClaims.mockReset();
  getUser.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "placeholder";
  process.env.AUTH_HEADER_SECRET = SECRET;
  delete process.env.AUTH_BYPASS_DEV;
});
afterEach(() => {
  process.env = { ...env };
});

const good = {
  sub: "u1",
  role: "authenticated",
  email: "me@example.com",
  user_metadata: { has_password: true },
};
const signedIn = () => getClaims.mockResolvedValue({ data: { claims: good }, error: null });
const signedOut = () => getClaims.mockResolvedValue({ data: null, error: null });
const rejected = () =>
  getClaims.mockResolvedValue({ data: null, error: { message: "Invalid JWT signature" } });
const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, { headers });

/** What the route handlers will see: Next exposes the forwarded request headers on the response. */
function forwardedHeader(res: Response): string | null {
  return res.headers.get(`x-middleware-request-${TRUSTED_USER_HEADER}`);
}

describe("proxy session (PERF-002)", () => {
  it("verifies locally: never calls getUser, and forwards a signed identity", async () => {
    signedIn();
    const res = await updateSession(req("/api/loans"));
    expect(getUser).not.toHaveBeenCalled();
    expect(getClaims).toHaveBeenCalledTimes(1);
    const user = await decodeTrustedUser(forwardedHeader(res), SECRET);
    expect(user).toEqual({ id: "u1", email: "me@example.com", hasPassword: true });
  });

  it("replaces a client-forged identity header, whatever the token says", async () => {
    signedOut();
    const forged = JSON.stringify({ id: "victim" });
    const res = await updateSession(req("/api/loans", { [TRUSTED_USER_HEADER]: forged }));
    expect(forwardedHeader(res)).toBeNull();
    expect(res.status).toBe(200); // APIs are not redirected; the route answers 401 itself
  });

  it("treats a token that fails verification as signed out (forged / tampered / expired)", async () => {
    rejected();
    const res = await updateSession(req("/api/loans", { [TRUSTED_USER_HEADER]: "x.y" }));
    expect(forwardedHeader(res)).toBeNull();
    const page = await updateSession(req("/dashboard"));
    expect(page.status).toBe(307);
  });

  it("does not accept a verified token that is not an end-user token (e.g. the anon key)", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u1", role: "anon" } }, error: null });
    const res = await updateSession(req("/api/loans"));
    expect(forwardedHeader(res)).toBeNull();
    getClaims.mockResolvedValue({ data: { claims: { role: "authenticated" } }, error: null });
    expect(forwardedHeader(await updateSession(req("/api/loans")))).toBeNull();
  });

  it("forwards nothing when AUTH_HEADER_SECRET is not configured", async () => {
    delete process.env.AUTH_HEADER_SECRET;
    signedIn();
    expect(forwardedHeader(await updateSession(req("/api/loans")))).toBeNull();
  });

  it("redirects a signed-out page request to /login with a way back, before the app loads", async () => {
    signedOut();
    const res = await updateSession(req("/savings?tab=goals"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search).toBe(
      "/login?next=%2Fsavings%3Ftab%3Dgoals"
    );
  });

  it.each(["/login", "/login/", "/auth/callback", "/api/auth/session", "/api/expenses/abc.png", "/api/cron/month-end"])(
    "leaves %s alone when signed out",
    async (path) => {
      signedOut();
      expect((await updateSession(req(path))).status).toBe(200);
    }
  );

  it("lets a signed-in user through to pages", async () => {
    signedIn();
    expect((await updateSession(req("/dashboard"))).status).toBe(200);
  });

  it("does not redirect in local dev bypass mode", async () => {
    process.env.AUTH_BYPASS_DEV = "true";
    (process.env as Record<string, string>).NODE_ENV = "development";
    signedOut();
    expect((await updateSession(req("/dashboard"))).status).toBe(200);
  });

  it("passes everything through when Supabase auth is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect((await updateSession(req("/dashboard"))).status).toBe(200);
    expect(getClaims).not.toHaveBeenCalled();
  });
});

describe("proxy-session helpers", () => {
  it("userFromClaims only accepts end-user tokens", () => {
    expect(userFromClaims(good)).toEqual({ id: "u1", email: "me@example.com", user_metadata: { has_password: true } });
    expect(userFromClaims(null)).toBeNull();
    expect(userFromClaims({ sub: "", role: "authenticated" })).toBeNull();
    expect(userFromClaims({ sub: "u1", role: "service_role" })).toBeNull();
    expect(userFromClaims({ sub: "u1", role: "authenticated" })).toEqual({ id: "u1", email: null, user_metadata: null });
  });

  it("classifies paths", () => {
    expect(isPublicPagePath("/login")).toBe(true);
    expect(isPublicPagePath("/loginx")).toBe(false);
    expect(isPublicPagePath("/auth/callback")).toBe(true);
    expect(requiresSignInRedirect("/")).toBe(true);
    expect(requiresSignInRedirect("/api/state")).toBe(false);
    expect(requiresSignInRedirect("/apix")).toBe(true);
    expect(loginRedirectPath("/a b", "?x=1")).toBe("/login?next=%2Fa%20b%3Fx%3D1");
  });

  describe("request IDs (OPS-002)", () => {
    const VERCEL = "hnd1::iad1::abcde-1700000000000-0123456789ab";
    const forwardedId = (res: Response) => res.headers.get("x-middleware-request-x-request-id");

    it("reuses x-vercel-id, forwards it to route handlers and returns it to the browser", async () => {
      signedIn();
      const res = await updateSession(req("/api/loans", { "x-vercel-id": VERCEL }));
      expect(forwardedId(res)).toBe(VERCEL);
      expect(res.headers.get("x-request-id")).toBe(VERCEL);
    });

    it("generates an ID when there is no x-vercel-id", async () => {
      signedIn();
      const res = await updateSession(req("/api/loans"));
      expect(forwardedId(res)).toMatch(/^req_[a-z0-9]{20}$/);
      expect(res.headers.get("x-request-id")).toBe(forwardedId(res));
    });

    it("never trusts a client-supplied x-request-id", async () => {
      signedIn();
      const res = await updateSession(req("/api/loans", { "x-request-id": "attacker-chosen-id-1" }));
      expect(forwardedId(res)).not.toBe("attacker-chosen-id-1");
      expect(res.headers.get("x-request-id")).not.toBe("attacker-chosen-id-1");
    });

    it("leaves the signed identity header exactly as before", async () => {
      signedIn();
      const res = await updateSession(req("/api/loans", { "x-vercel-id": VERCEL }));
      const user = await decodeTrustedUser(forwardedHeader(res), SECRET);
      expect(user).toEqual({ id: "u1", email: "me@example.com", hasPassword: true });
    });

    it("stamps the sign-in redirect too, and requests when Supabase is not configured", async () => {
      signedOut();
      const redirect = await updateSession(req("/dashboard", { "x-vercel-id": VERCEL }));
      expect(redirect.status).toBe(307);
      expect(redirect.headers.get("x-request-id")).toBe(VERCEL);

      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      const bare = await updateSession(req("/api/loans", { "x-vercel-id": VERCEL }));
      expect(bare.headers.get("x-request-id")).toBe(VERCEL);
      expect(forwardedId(bare)).toBe(VERCEL);
    });
  });
});
