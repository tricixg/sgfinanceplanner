// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Snackbar } from "@/components/Snackbar";
import { DomainLoadErrorBanner } from "@/components/app/DomainLoadErrorBanner";
import { AppDataContext, type AppDataContextValue } from "@/contexts/app-data-contexts";
import { fetchJson } from "@/lib/fetch-json";
import {
  rememberFailure,
  requestIdForChannel,
  requestIdForMessage,
  resetRequestIdsForTests,
} from "@/lib/observability/client-request-ids";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ID = "hnd1::iad1::abcde-1700000000000-0123456789ab";
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  resetRequestIdsForTests();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function failingResponse() {
  return new Response(JSON.stringify({ error: "Something went wrong. Please try again.", requestId: ID }), {
    status: 500,
    headers: { "content-type": "application/json", "x-request-id": ID },
  });
}

describe("request ID in the UI (OPS-002)", () => {
  it("an error toast from a failed request shows a small, copyable reference", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => failingResponse()));
    const { res, data } = await fetchJson<{ error: string }>("/api/expenses", { method: "POST" });
    expect(res.ok).toBe(false);

    // What a save handler shows: its own words around the server's message.
    const message = `Couldn't save your expense. ${data.error}`;
    await act(async () => {
      root.render(<Snackbar message={message} variant="error" onDismiss={() => {}} />);
    });
    expect(host.querySelector(".request-id")?.textContent).toContain(ID);

    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const copy = [...host.querySelectorAll("button")].find((b) => b.textContent === "Copy")!;
    await act(async () => copy.click());
    expect(writeText).toHaveBeenCalledWith(ID);
    expect(host.textContent).toContain("Copied");
  });

  it("success toasts and messages that did not come from the server show no reference", async () => {
    rememberFailure({ text: "Something went wrong. Please try again.", requestId: ID });
    await act(async () => {
      root.render(<Snackbar message="Saved" variant="success" onDismiss={() => {}} />);
    });
    expect(host.querySelector(".request-id")).toBeNull();
    await act(async () => {
      root.render(<Snackbar message="Couldn't save. Something else entirely." variant="error" onDismiss={() => {}} />);
    });
    expect(host.querySelector(".request-id")).toBeNull();
  });

  it("a request that never got a response (timeout / offline) has no reference", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("fetch", vi.fn());
    const err = await fetchJson("/api/x").catch((e: Error) => e);
    await act(async () => {
      root.render(<Snackbar message={(err as Error).message} variant="error" onDismiss={() => {}} />);
    });
    expect(host.querySelector(".request-id")).toBeNull();
  });

  it("a failed-load banner shows the reference filed under its domain", async () => {
    rememberFailure({ channel: "domain:cards", requestId: ID });
    const ctx = {
      loadErrors: { cards: "Couldn't load credit cards" },
      domainStatus: {},
      reload: vi.fn(),
    } as unknown as AppDataContextValue;
    await act(async () => {
      root.render(
        <AppDataContext.Provider value={ctx}>
          <DomainLoadErrorBanner domain="cards" />
        </AppDataContext.Provider>
      );
    });
    expect(host.querySelector(".request-id")?.textContent).toContain(ID);
  });

  it("ignores IDs that are not well-formed", () => {
    rememberFailure({ text: "boom", requestId: "<script>x</script>" });
    rememberFailure({ text: "boom", requestId: 12 });
    rememberFailure({ channel: "domain:loans", requestId: "bad id" });
    expect(requestIdForMessage("Couldn't save. boom")).toBeNull();
    expect(requestIdForChannel("domain:loans")).toBeNull();
  });
});
