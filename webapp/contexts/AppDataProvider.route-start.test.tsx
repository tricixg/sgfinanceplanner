// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/wealth";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { AppDataProvider } from "@/contexts/AppDataProvider";

let log: { url: string; at: number }[];
let t0 = 0;

beforeEach(() => {
  log = [];
  t0 = Date.now();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      log.push({ url: String(input).split("?")[0], at: Date.now() - t0 });
      await new Promise((r) => setTimeout(r, 60));
      return new Response(JSON.stringify({ configured: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mountAt(path: string) {
  pathname = path;
  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(<AppDataProvider userId="u1">{null}</AppDataProvider>);
  });
  // Less time than one core fetch takes (60 ms): only requests made on route entry can be here.
  await act(async () => void (await new Promise((r) => setTimeout(r, 25))));
  const urls = log.map((l) => l.url).sort();
  await act(async () => void (await new Promise((r) => setTimeout(r, 400))));
  await act(async () => root.unmount());
  return urls;
}

describe("route entry (PERF-003)", () => {
  it("starts a page's lazily-loaded data together with its core data, not after it", async () => {
    const early = await mountAt("/wealth");
    expect(early).toEqual(
      expect.arrayContaining(["/api/accounts", "/api/funds", "/api/savings", "/api/profile", "/api/holdings"])
    );
  });

  it("a page that needs nothing from the session starts nothing", async () => {
    expect(await mountAt("/expenses")).toEqual([]);
  });

  it("only the declared core domains are fetched for a light page", async () => {
    await mountAt("/cards");
    expect([...new Set(log.map((l) => l.url))]).toEqual(["/api/credit-cards"]);
  });
});
