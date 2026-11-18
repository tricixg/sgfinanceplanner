// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabCPF } from "@/components/tabs/TabCPF";
import { NotifyHost } from "@/components/app/NotifyHost";
import { AppDataContext, type AppDataContextValue } from "@/contexts/app-data-contexts";
import { createEmptyState } from "@/lib/finance/defaults";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The chart and the log forms are not under test; keep them out of jsdom.
vi.mock("@/components/ChartBox", () => ({ ChartBox: () => null }));
vi.mock("@/components/cpf/CpfTransactionForm", () => ({ CpfTransactionForm: () => null }));
vi.mock("@/components/cpf/CpfOaHistory", () => ({ CpfOaHistory: () => null }));
vi.mock("@/components/cpf/CpfAssumptions", () => ({ CpfAssumptions: () => null }));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

function button(label: string): HTMLButtonElement {
  const el = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  if (!el) throw new Error(`no "${label}" button`);
  return el as HTMLButtonElement;
}

describe("TabCPF balance save", () => {
  it("shows the failure and keeps the form open with the typed input", async () => {
    const saveProfile = vi.fn().mockRejectedValue(new Error("The server took too long — try again."));
    const state = { ...createEmptyState(), oa: 1000, sa: 2000, ma: 3000 };
    const ctx = {
      configured: true,
      cpfContributions: [],
      cpfTransactions: [],
      saveProfile,
    } as unknown as AppDataContextValue;

    await act(async () => {
      root.render(
        <AppDataContext.Provider value={ctx}>
          <TabCPF state={state} setState={() => {}} />
          <NotifyHost />
        </AppDataContext.Provider>
      );
    });

    await act(async () => button("Edit").click());
    const oaInput = host.querySelector<HTMLInputElement>(".editrow input");
    expect(oaInput).not.toBeNull();
    // React tracks the value; use the native setter so onChange fires.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(oaInput, "1234");
      oaInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => button("Save").click());
    await flush();

    expect(saveProfile).toHaveBeenCalledTimes(1);
    expect(saveProfile.mock.calls[0]![0]).toMatchObject({ oa: 1234 });

    // The user is told, with the reason.
    const snackbar = host.querySelector(".snackbar--error");
    expect(snackbar?.textContent).toContain("Couldn't save your CPF balances");
    expect(snackbar?.textContent).toContain("The server took too long");

    // The form is still open, input intact, and Save is usable again.
    expect(host.querySelector(".editrow input")).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>(".editrow input")!.value).toBe("1234");
    expect(button("Save").disabled).toBe(false);
  });

  it("disables Save while the request is in flight (no double submit)", async () => {
    let resolve!: () => void;
    const saveProfile = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const ctx = {
      configured: true,
      cpfContributions: [],
      cpfTransactions: [],
      saveProfile,
    } as unknown as AppDataContextValue;
    await act(async () => {
      root.render(
        <AppDataContext.Provider value={ctx}>
          <TabCPF state={createEmptyState()} setState={() => {}} />
        </AppDataContext.Provider>
      );
    });
    await act(async () => button("Edit").click());
    await act(async () => button("Save").click());
    expect(button("Saving…").disabled).toBe(true);
    await act(async () => button("Saving…").click());
    expect(saveProfile).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
  });
});
