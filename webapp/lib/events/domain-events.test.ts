/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchDomainEvent,
  subscribeDomainEvent,
} from "@/lib/events/domain-events";

describe("domain-events", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches and receives a typed event", () => {
    const handler = vi.fn();
    const unsub = subscribeDomainEvent("expense:changed", handler);
    dispatchDomainEvent("expense:changed");
    expect(handler).toHaveBeenCalledTimes(1);
    unsub();
    dispatchDomainEvent("expense:changed");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("dispatches multiple events in one call", () => {
    const expense = vi.fn();
    const recurring = vi.fn();
    const unsubA = subscribeDomainEvent("expense:changed", expense);
    const unsubB = subscribeDomainEvent("recurring:changed", recurring);
    dispatchDomainEvent(["expense:changed", "recurring:changed"]);
    expect(expense).toHaveBeenCalledTimes(1);
    expect(recurring).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });
});
