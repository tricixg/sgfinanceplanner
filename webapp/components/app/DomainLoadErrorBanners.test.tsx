// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DomainLoadErrorBanners } from "@/components/app/DomainLoadErrorBanners";
import { AppDataContext, type AppDataContextValue } from "@/contexts/app-data-contexts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(ctx: Partial<AppDataContextValue>) {
  return act(async () => {
    root.render(
      <AppDataContext.Provider value={ctx as AppDataContextValue}>
        <DomainLoadErrorBanners />
      </AppDataContext.Provider>
    );
  });
}

describe("failed loads (REL-001)", () => {
  it("renders nothing when every domain loaded", async () => {
    await render({ loadErrors: {}, domainStatus: { budget: "ready", cpfContributions: "ready" } as never });
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });

  it("shows a Retry banner for a failed domain, says editing is off, and Retry reloads", async () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    await render({ loadErrors: { cards: "Couldn't load credit cards" }, domainStatus: {} as never, reload });
    const alerts = host.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.textContent).toContain("Couldn’t load your credit cards");
    expect(alerts[0]!.textContent).toContain("editing is turned off");
    const retry = [...alerts[0]!.querySelectorAll("button")].find((b) => b.textContent === "Retry")!;
    await act(async () => retry.click());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("covers domains that are not whole-list saves (budget, CPF history) via their load status", async () => {
    const reloadCpf = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    await render({
      loadErrors: {},
      domainStatus: { budget: "error", cpfContributions: "error", netWorth: "ready" } as never,
      reload,
      reloadCpfContributions: reloadCpf,
    });
    const alerts = [...host.querySelectorAll('[role="alert"]')];
    expect(alerts).toHaveLength(2);
    const budget = alerts.find((a) => a.textContent?.includes("budget"))!;
    const cpf = alerts.find((a) => a.textContent?.includes("cpf contributions"))!;
    expect(budget.textContent).toContain("editing is turned off"); // budget saves are refused
    expect(cpf.textContent).not.toContain("editing is turned off"); // a read-only history is not
    await act(async () => [...cpf.querySelectorAll("button")].find((b) => b.textContent === "Retry")!.click());
    expect(reloadCpf).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
