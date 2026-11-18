// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppDataProvider } from "@/hooks/useAppData";
import { DEFAULT_FETCH_TIMEOUT_MS } from "@/lib/fetch-json";
import type { DataDomain } from "@/lib/app/domains";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let latest: ReturnType<typeof useAppDataProvider>;
function Harness({ needs }: { needs: readonly DataDomain[] }) {
  const v = useAppDataProvider(true, needs);
  useEffect(() => {
    latest = v;
  });
  return null;
}

describe("a request that never answers cannot leave a page on Loading… (REL-001)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Every request hangs until aborted, like a stalled connection.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise<Response>((_res, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          })
      )
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("settles to an error after the timeout, with the section flagged and editing blocked", async () => {
    const root = createRoot(document.createElement("div"));
    await act(async () => void root.render(<Harness needs={["cards"]} />));
    expect(latest.loading).toBe(true);

    await act(async () => void (await vi.advanceTimersByTimeAsync(DEFAULT_FETCH_TIMEOUT_MS)));

    expect(latest.loading).toBe(false);
    expect(latest.domainStatus.cards).toBe("error");
    expect(latest.loadErrors.cards).toBeTruthy();
    await expect(latest.saveCards([])).rejects.toThrow(/editing is disabled|finished loading/);
  });
});
