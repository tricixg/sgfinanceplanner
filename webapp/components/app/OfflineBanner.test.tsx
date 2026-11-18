// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineBanner } from "@/components/app/OfflineBanner";
import { OFFLINE_MESSAGE } from "@/lib/fetch-json";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllGlobals());

describe("OfflineBanner", () => {
  it("appears when the browser goes offline and disappears when it comes back", async () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await act(async () => void root.render(<OfflineBanner />));
    expect(host.textContent).toBe("");

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => void window.dispatchEvent(new Event("offline")));
    expect(host.textContent).toContain(OFFLINE_MESSAGE);

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await act(async () => void window.dispatchEvent(new Event("online")));
    expect(host.textContent).toBe("");
  });
});
