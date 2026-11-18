/* eslint-disable @typescript-eslint/no-unused-vars -- handlers take a request argument only to mirror the real signature */
import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiError } from "@/lib/api/api-error";
import { withRequestId } from "@/lib/api/with-request-id";
import { installRequestIdLogging, stampRequestId } from "@/lib/observability/console-request-id";
import { currentRequestId } from "@/lib/observability/request-context";

const ID = "hnd1::iad1::abcde-1700000000000-0123456789ab";
const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { headers }) as never;

let errors: unknown[][];
beforeEach(() => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void errors.push(a));
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("request IDs (OPS-002)", () => {
  it("a failing route returns the same request ID it logged", async () => {
    const handler = withRequestId(async function GET(_req?: unknown) {
      return apiError("api/widgets", new Error('relation "widgets" does not exist (42P01)'));
    });
    const res = await handler(req({ "x-request-id": ID }));
    const body = await res.json();

    expect(res.status).toBe(500);
    // Generic message to the user, never the database text...
    expect(body.error).toBe("Something went wrong. Please try again.");
    // ...with the ID in the body and the header...
    expect(body.requestId).toBe(ID);
    expect(res.headers.get("x-request-id")).toBe(ID);
    // ...and the very same ID in the server_error log line.
    const line = JSON.parse(String(errors.find((e) => String(e[0]).includes("server_error"))![0]));
    expect(line.scope).toBe("api/widgets");
    expect(line.requestId).toBe(ID);
  });

  it("adds requestId to inline JSON error responses too, whatever built them", async () => {
    const handler = withRequestId(async function POST(_req?: unknown) {
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
    });
    const res = await handler(req({ "x-request-id": ID }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Amount must be positive", requestId: ID });
    expect(res.headers.get("x-request-id")).toBe(ID);
  });

  it("keeps cookies and other headers on a rewritten error response", async () => {
    const handler = withRequestId(async function POST(_req?: unknown) {
      const r = NextResponse.json({ error: "nope" }, { status: 401 });
      r.cookies.set("sb", "1");
      r.headers.set("x-extra", "keep");
      return r;
    });
    const res = await handler(req({ "x-request-id": ID }));
    expect(res.headers.get("x-extra")).toBe("keep");
    expect(res.headers.get("set-cookie")).toContain("sb=1");
  });

  it("leaves success bodies untouched and only stamps the header", async () => {
    const handler = withRequestId(async function GET(_req?: unknown) {
      return NextResponse.json({ items: [1, 2] });
    });
    const res = await handler(req({ "x-request-id": ID }));
    expect(await res.json()).toEqual({ items: [1, 2] });
    expect(res.headers.get("x-request-id")).toBe(ID);
  });

  it("does not touch a body that already has a requestId, or non-error JSON shapes", async () => {
    const a = await withRequestId(async function GET(_req?: unknown) {
      return NextResponse.json({ error: "x", requestId: "keep-this-1" }, { status: 500 });
    })(req({ "x-request-id": ID }));
    expect((await a.json()).requestId).toBe("keep-this-1");
    const b = await withRequestId(async function GET(_req?: unknown) {
      return NextResponse.json([1, 2], { status: 400 });
    })(req({ "x-request-id": ID }));
    expect(await b.json()).toEqual([1, 2]);
  });

  it("makes the ID available inside the handler, and not outside it", async () => {
    let seen: string | undefined;
    const handler = withRequestId(async function GET(_req?: unknown) {
      await Promise.resolve();
      seen = currentRequestId();
      return NextResponse.json({});
    });
    await handler(req({ "x-request-id": ID }));
    expect(seen).toBe(ID);
    expect(currentRequestId()).toBeUndefined();
  });

  it("falls back to x-vercel-id, then to a generated ID, and ignores junk values", async () => {
    const run = async (headers: Record<string, string>) => {
      const res = await withRequestId(async function GET(_req?: unknown) {
        return NextResponse.json({});
      })(req(headers));
      return res.headers.get("x-request-id")!;
    };
    expect(await run({ "x-vercel-id": ID })).toBe(ID);
    expect(await run({ "x-request-id": "bad id with spaces and <tags>" })).toMatch(/^req_[a-z0-9]{20}$/);
    expect(await run({})).toMatch(/^req_[a-z0-9]{20}$/);
  });

  it("works when a test (or caller) invokes a handler with no request", async () => {
    const res = await withRequestId(async function GET(_req?: unknown) {
      return NextResponse.json({ ok: true });
    })();
    expect(res.status).toBe(200);
  });

  it("stamps the ID into [scope] log lines written during the request", async () => {
    const lines: unknown[][] = [];
    const fake = { log: () => {}, info: (...a: unknown[]) => void lines.push(a), warn: () => {}, error: () => {} };
    installRequestIdLogging(fake as unknown as Console);
    installRequestIdLogging(fake as unknown as Console); // installing twice must not double-wrap
    const handler = withRequestId(async function GET(_req?: unknown) {
      fake.info("[api/widgets] GET ok", { count: 3 });
      fake.info("plain text is untouched");
      return NextResponse.json({});
    });
    await handler(req({ "x-request-id": ID }));
    fake.info("[api/widgets] outside a request");
    expect(lines[0]).toEqual([`[api/widgets] [req ${ID}] GET ok`, { count: 3 }]);
    expect(lines[1]).toEqual(["plain text is untouched"]);
    expect(lines[2]).toEqual(["[api/widgets] outside a request"]);
  });

  it("stampRequestId only edits a leading [scope] and keeps the other arguments", () => {
    expect(stampRequestId(["[household] created", { a: 1 }], "abc12345")).toEqual([
      "[household] [req abc12345] created",
      { a: 1 },
    ]);
    expect(stampRequestId(["no scope"], "abc12345")).toEqual(["no scope"]);
    expect(stampRequestId([{ obj: true }], "abc12345")).toEqual([{ obj: true }]);
    expect(stampRequestId(["[x] y"], undefined)).toEqual(["[x] y"]);
  });
});
