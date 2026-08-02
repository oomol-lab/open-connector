import { describe, expect, it } from "vitest";
import { IsolatePromiseCache } from "./isolate-promise-cache.ts";

describe("IsolatePromiseCache", () => {
  it("creates once per key and reuses the resolved promise", async () => {
    const cache = new IsolatePromiseCache<string>();
    let creations = 0;
    const create = async (): Promise<string> => {
      creations++;
      return "value";
    };

    await expect(cache.get("k", create)).resolves.toBe("value");
    await expect(cache.get("k", create)).resolves.toBe("value");
    expect(creations).toBe(1);
  });

  it("shares one in-flight promise between concurrent callers", async () => {
    const cache = new IsolatePromiseCache<string>();
    let creations = 0;
    let release = (): void => {};
    const create = (): Promise<string> => {
      creations++;
      return new Promise<string>((resolve) => {
        release = () => resolve("value");
      });
    };

    const first = cache.get("k", create);
    const second = cache.get("k", create);
    expect(first).toBe(second);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual(["value", "value"]);
    expect(creations).toBe(1);
  });

  it("evicts a rejected promise so the next caller retries", async () => {
    const cache = new IsolatePromiseCache<string>();
    let attempts = 0;
    const create = async (): Promise<string> => {
      attempts++;
      if (attempts === 1) {
        throw new Error("transient");
      }
      return "recovered";
    };

    await expect(cache.get("k", create)).rejects.toThrow("transient");
    await expect(cache.get("k", create)).resolves.toBe("recovered");
    expect(attempts).toBe(2);
  });

  it("keeps rejecting concurrent callers of the failed attempt, then retries once", async () => {
    const cache = new IsolatePromiseCache<string>();
    let attempts = 0;
    const create = async (): Promise<string> => {
      attempts++;
      if (attempts === 1) {
        throw new Error("transient");
      }
      return "recovered";
    };

    const settled = await Promise.allSettled([cache.get("k", create), cache.get("k", create)]);
    expect(settled.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(attempts).toBe(1);
    await expect(cache.get("k", create)).resolves.toBe("recovered");
    expect(attempts).toBe(2);
  });

  it("replaces the slot when the key changes", async () => {
    const cache = new IsolatePromiseCache<string>();
    const create = (value: string) => async (): Promise<string> => value;

    await expect(cache.get("a", create("first"))).resolves.toBe("first");
    await expect(cache.get("b", create("second"))).resolves.toBe("second");
    await expect(cache.get("a", create("third"))).resolves.toBe("third");
  });

  it("does not evict a newer key when an older promise rejects afterwards", async () => {
    const cache = new IsolatePromiseCache<string>();
    let failOld = (): void => {};
    const oldEntry = cache.get(
      "old",
      () =>
        new Promise<string>((_resolve, reject) => {
          failOld = () => reject(new Error("stale"));
        }),
    );
    let newCreations = 0;
    const createNew = async (): Promise<string> => {
      newCreations++;
      return "fresh";
    };

    await expect(cache.get("new", createNew)).resolves.toBe("fresh");
    failOld();
    await expect(oldEntry).rejects.toThrow("stale");

    // The rejection belongs to the replaced entry, so the live "new" slot must still be memoized.
    await expect(cache.get("new", createNew)).resolves.toBe("fresh");
    expect(newCreations).toBe(1);
  });

  it("does not report an unhandled rejection when nobody awaits the evicted promise", async () => {
    const cache = new IsolatePromiseCache<string>();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      const rejected = cache.get("k", async () => {
        throw new Error("transient");
      });
      await expect(rejected).rejects.toThrow("transient");
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
