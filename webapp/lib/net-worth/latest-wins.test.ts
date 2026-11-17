import { describe, expect, it } from "vitest";
import { createLatestWinsWriter } from "./latest-wins";

/** A send() whose completion the test controls, recording start order. */
function controlledSend() {
  const started: number[] = [];
  const resolvers: Array<{ ok: () => void; fail: (e: Error) => void }> = [];
  let active = 0;
  let maxActive = 0;
  const send = (v: number) =>
    new Promise<void>((resolve, reject) => {
      started.push(v);
      active++;
      maxActive = Math.max(maxActive, active);
      resolvers.push({
        ok: () => {
          active--;
          resolve();
        },
        fail: (e) => {
          active--;
          reject(e);
        },
      });
    });
  return { send, started, resolvers, maxActive: () => maxActive };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createLatestWinsWriter (DATA-005)", () => {
  it("never overlaps requests and sends only the newest value queued behind an in-flight one", async () => {
    const c = controlledSend();
    const w = createLatestWinsWriter(c.send);
    const a = w.write(1);
    await tick();
    const b = w.write(2);
    const d = w.write(3);
    await tick();
    expect(c.started).toEqual([1]); // 2 and 3 wait; no overlapping POST
    c.resolvers[0].ok();
    await tick();
    expect(c.started).toEqual([1, 3]); // 2 was superseded
    c.resolvers[1].ok();
    expect(await a).toBe(1);
    expect(await b).toBe(3); // superseded callers see what was actually persisted
    expect(await d).toBe(3);
    expect(c.maxActive()).toBe(1);
  });

  it("the last write is always the last one sent (out-of-order completion cannot reorder)", async () => {
    const c = controlledSend();
    const w = createLatestWinsWriter(c.send);
    void w.write(10);
    await tick();
    void w.write(20);
    c.resolvers[0].ok();
    await tick();
    c.resolvers[1].ok();
    await tick();
    expect(c.started.at(-1)).toBe(20);
  });

  it("a failed request rejects its callers but does not block later writes", async () => {
    const c = controlledSend();
    const w = createLatestWinsWriter(c.send);
    const a = w.write(1);
    const aSettled = a.catch((e: Error) => e.message);
    await tick();
    c.resolvers[0].fail(new Error("500"));
    expect(await aSettled).toBe("500");
    const b = w.write(2);
    await tick();
    c.resolvers[1].ok();
    expect(await b).toBe(2);
  });

  it("sends immediately when idle", async () => {
    const c = controlledSend();
    const w = createLatestWinsWriter(c.send);
    void w.write(7);
    await tick();
    expect(c.started).toEqual([7]);
  });
});
