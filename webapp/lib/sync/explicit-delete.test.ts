import { describe, expect, it } from "vitest";
import {
  assertDomainEditable,
  isDomainEditable,
  removedIds,
} from "@/lib/sync/explicit-delete";
import { cleanIdList, isPersistedId } from "@/lib/sync/save-error";

type Item = { id?: string };

describe("removedIds", () => {
  it("returns only loaded rows the user removed", () => {
    const loaded: Item[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(removedIds(loaded, [{ id: "a" }, { id: "c" }, { id: "new-1" }], (x) => x.id)).toEqual(["b"]);
  });

  it("is empty when nothing was loaded (e.g. a failed load) — no deletes can be derived", () => {
    expect(removedIds<Item>([], [{ id: "x" }], (x) => x.id)).toEqual([]);
    expect(removedIds<Item>([], [], (x) => x.id)).toEqual([]);
  });

  it("ignores rows without an id", () => {
    expect(removedIds<Item>([{}, { id: "a" }], [], (x) => x.id)).toEqual(["a"]);
  });
});

describe("load-failure guard", () => {
  it("disables editing for a domain that failed to load, and only that domain", () => {
    const errors = { cards: "Couldn't load credit cards" };
    expect(isDomainEditable(errors, "cards")).toBe(false);
    expect(isDomainEditable(errors, "loans")).toBe(true);
    expect(() => assertDomainEditable(errors, "cards")).toThrow(/editing is disabled/);
    expect(() => assertDomainEditable(errors, "holdings")).not.toThrow();
  });

  it("allows editing again once the error is cleared", () => {
    expect(isDomainEditable({}, "cards")).toBe(true);
  });
});

describe("id helpers", () => {
  it("only treats uuids as persisted ids", () => {
    expect(isPersistedId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(true);
    expect(isPersistedId("new-pool-0")).toBe(false);
    expect(isPersistedId(undefined)).toBe(false);
  });

  it("cleanIdList drops junk and duplicates", () => {
    expect(cleanIdList("nope")).toEqual([]);
    expect(cleanIdList([1, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "x"])).toEqual([
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ]);
  });
});
