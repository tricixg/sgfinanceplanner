import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  FetchError,
  NETWORK_MESSAGE,
  OFFLINE_MESSAGE,
  TIMEOUT_MESSAGE,
  fetchJson,
} from "@/lib/fetch-json";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A fetch that never answers, but rejects with AbortError when its signal fires (like a browser). */
function hangingFetch() {
  return vi.fn((_input: unknown, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError"))
      );
    });
  });
}

describe("fetchJson", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the parsed body on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: 1 })));
    const { res, data } = await fetchJson<{ ok: number }>("/api/x");
    expect(res.ok).toBe(true);
    expect(data).toEqual({ ok: 1 });
  });

  it("fails with a readable error after the default timeout", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const p = fetchJson("/api/x").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS - 1);
    let settled = false;
    void p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await p;
    expect(err).toBeInstanceOf(FetchError);
    expect((err as FetchError).kind).toBe("timeout");
    expect((err as FetchError).message).toBe(TIMEOUT_MESSAGE);
  });

  it("honours a per-call timeout", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const p = fetchJson("/api/x", { timeoutMs: 100 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(100);
    expect(((await p) as FetchError).kind).toBe("timeout");
  });

  it("timeoutMs: 0 disables the timeout", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    let settled = false;
    void fetchJson("/api/x", { timeoutMs: 0 }).then(
      () => (settled = true),
      () => (settled = true)
    );
    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS * 4);
    expect(settled).toBe(false);
  });

  it("times out when the body stalls after the headers arrived", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_i: unknown, init?: RequestInit) => {
        const stream = new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("aborted", "AbortError"))
            );
          },
        });
        return new Response(stream, { headers: { "content-type": "application/json" } });
      })
    );
    const p = fetchJson("/api/x").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS);
    expect(((await p) as FetchError).kind).toBe("timeout");
  });

  it("does not time out a request that finished, and clears its timer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    await fetchJson("/api/x");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("says so when the browser is offline, without calling fetch", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    vi.stubGlobal("navigator", { onLine: false });
    const err = await fetchJson("/api/x").catch((e: unknown) => e);
    expect((err as FetchError).kind).toBe("offline");
    expect((err as FetchError).message).toBe(OFFLINE_MESSAGE);
    expect(f).not.toHaveBeenCalled();
  });

  it("reports a dropped connection as offline when the browser says so mid-request", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        vi.stubGlobal("navigator", { onLine: false });
        throw new TypeError("Failed to fetch");
      })
    );
    const err = await fetchJson("/api/x").catch((e: unknown) => e);
    expect((err as FetchError).kind).toBe("offline");
  });

  it("reports other network failures with a connection message", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const err = await fetchJson("/api/x").catch((e: unknown) => e);
    expect((err as FetchError).kind).toBe("network");
    expect((err as FetchError).message).toBe(NETWORK_MESSAGE);
  });

  it("lets a caller's own abort through unchanged", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const ac = new AbortController();
    const p = fetchJson("/api/x", { signal: ac.signal }).catch((e: unknown) => e);
    ac.abort();
    const err = await p;
    expect(err).not.toBeInstanceOf(FetchError);
    expect((err as Error).name).toBe("AbortError");
  });
});
