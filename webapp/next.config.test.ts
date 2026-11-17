import { afterEach, describe, expect, it, vi } from "vitest";

async function headersFor(supabaseUrl: string | undefined) {
  vi.resetModules();
  if (supabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  const { default: config } = await import("./next.config");
  const rules = await config.headers!();
  return Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
}

const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = original;
});

describe("security headers (SEC-005)", () => {
  it("ships CSP as report-only and allows only self + the Supabase origin to connect", async () => {
    const h = await headersFor("https://abc.supabase.co/rest/v1");
    expect(h["Content-Security-Policy"]).toBeUndefined();
    const csp = h["Content-Security-Policy-Report-Only"];
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co;");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("still builds a valid policy when the Supabase URL is unset", async () => {
    const csp = (await headersFor(undefined))["Content-Security-Policy-Report-Only"];
    expect(csp).toContain("connect-src 'self';");
  });

  it("sets Permissions-Policy and HSTS", async () => {
    const h = await headersFor("https://abc.supabase.co");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d+/);
  });
});
