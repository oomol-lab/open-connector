import type { ExecutionContext } from "../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { defineProviderExecutors } from "./provider-runtime.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider runtime fetch", () => {
  it("does not forward the provider context as the native fetch receiver", async () => {
    let nativeFetchThis: unknown = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(function (this: unknown) {
        nativeFetchThis = this;
        if (this !== undefined) {
          throw new TypeError("Illegal invocation: function called with incorrect `this` reference");
        }
        return Promise.resolve(Response.json({ ok: true }));
      }),
    );
    const executors = defineProviderExecutors<{ fetcher: typeof fetch }>({
      service: "receiver_test",
      handlers: {
        async request(_input, context) {
          const response = await context.fetcher("https://example.com/action");
          return response.json();
        },
      },
      createContext(_context, fetcher) {
        return { fetcher };
      },
    });
    const executionContext: ExecutionContext = {
      async getCredential() {
        return undefined;
      },
    };

    await expect(executors["receiver_test.request"]!({}, executionContext)).resolves.toEqual({
      ok: true,
      output: { ok: true },
    });
    expect(nativeFetchThis).toBeUndefined();
  });
});
