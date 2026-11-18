import { afterEach, describe, expect, it, vi } from "vitest";
import { scrubLogText, scrubPath, serverErrorLine } from "@/lib/observability/server-error";
import { apiError } from "@/lib/api/api-error";
import { onRequestError } from "@/instrumentation";

afterEach(() => vi.restoreAllMocks());

describe("scrubLogText", () => {
  it("removes emails, ids, tokens, secrets and amounts", () => {
    const out = scrubLogText(
      'Key (user_id, month)=(3f1c2b8e-9d4a-4c1e-8f2a-1b2c3d4e5f60, 2026-07-01) exists; invite a@b.co; balance 1,234.56; ' +
        "Authorization: Bearer eyJhbGciOi.eyJzdWIi.sig password=hunter2"
    );
    expect(out).not.toMatch(/3f1c2b8e|a@b\.co|1,234\.56|eyJ|hunter2|2026/);
    expect(out).toContain("[id]");
    expect(out).toContain("[email]");
    expect(out).toContain("[n]");
    expect(out).toContain("Key (user_id, month)");
  });

  it("caps very long messages", () => {
    expect(scrubLogText("x".repeat(2000)).length).toBe(500);
  });

  it("drops the query string and ids from paths", () => {
    expect(scrubPath("/api/expenses/3f1c2b8e-9d4a-4c1e-8f2a-1b2c3d4e5f60?ym=2026-11&token=abc")).toBe("/api/expenses/[id]");
  });
});

describe("serverErrorLine", () => {
  it("is one JSON line with a searchable event name and no undefined fields", () => {
    const line = serverErrorLine(
      { scope: "api/x", message: "boom 42.50", code: "23505", path: "/api/x?ym=2026-01" },
      new Date("2026-11-18T00:00:00Z")
    );
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({
      level: "error",
      event: "server_error",
      time: "2026-11-18T00:00:00.000Z",
      scope: "api/x",
      message: "boom [n]",
      code: "23505",
      path: "/api/x",
    });
  });
});

describe("wiring", () => {
  it("apiError logs one scrubbed JSON line for a masked error and none for a public message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    apiError("api/expenses", { message: 'duplicate key for a@b.co amount 99.90', code: "23505" });
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(String(spy.mock.calls[0]![0]));
    expect(logged).toMatchObject({ event: "server_error", scope: "api/expenses", code: "23505" });
    expect(logged.message).not.toMatch(/a@b\.co|99\.90/);

    spy.mockClear();
    apiError("api/expenses", "Insufficient balance");
    expect(spy).not.toHaveBeenCalled();
  });

  it("onRequestError logs method, path without query, route info — never headers", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await onRequestError(
      Object.assign(new Error("kaboom"), { digest: "123abc" }),
      { path: "/api/summary?ym=2026-11", method: "GET", headers: { cookie: "sb-access-token=secret" } },
      {
        routerKind: "App Router",
        routePath: "/api/summary",
        routeType: "route",
        renderSource: "react-server-components",
        revalidateReason: undefined,
      }
    );
    const line = String(spy.mock.calls[0]![0]);
    expect(line).not.toContain("secret");
    expect(JSON.parse(line)).toMatchObject({
      event: "server_error",
      scope: "next/route",
      message: "kaboom",
      digest: "123abc",
      method: "GET",
      path: "/api/summary",
      routePath: "/api/summary",
      routeType: "route",
    });
  });
});
