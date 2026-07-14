import type { ExecutionContext, ResolvedCredential } from "../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../core/request.ts";
import { defineProviderExecutors, defineProviderProxy, providerFetch } from "./provider-runtime.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  setPrivateNetworkAccessAllowed(false);
});

const apiKeyCredential: ResolvedCredential = {
  authType: "api_key",
  apiKey: "test-key",
  values: {},
  profile: { accountId: "acct", displayName: "Test", grantedScopes: [] },
  metadata: {},
};

const executionContext: ExecutionContext = {
  getCredential: async () => apiKeyCredential,
};

function stubFetchSequence(responses: Response[]): Array<{ url: string; init: RequestInit | undefined }> {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: input instanceof Request ? input.url : String(input), init });
    const response = responses.shift();
    if (!response) {
      throw new Error("unexpected extra request");
    }
    return response;
  });
  return calls;
}

describe("provider egress SSRF guard", () => {
  it("blocks proxy responses redirecting to metadata targets", async () => {
    const calls = stubFetchSequence([
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }),
    ]);
    const proxy = defineProviderProxy({
      service: "test_service",
      baseUrl: "https://api.example.com",
      auth: { type: "bearer" },
    });

    const result = await proxy({ method: "GET", endpoint: "/items" }, executionContext);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.message).toContain("redirect location");
    expect(calls).toHaveLength(1);
  });

  it("follows public proxy redirects", async () => {
    const calls = stubFetchSequence([
      new Response(null, { status: 302, headers: { location: "https://cdn.example.net/items" } }),
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }),
    ]);
    const proxy = defineProviderProxy({
      service: "test_service",
      baseUrl: "https://api.example.com",
      auth: { type: "bearer" },
    });

    const result = await proxy({ method: "GET", endpoint: "/items" }, executionContext);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.response.data).toEqual({ ok: true });
    expect(calls.map((call) => call.url)).toEqual(["https://api.example.com/items", "https://cdn.example.net/items"]);
  });

  it("gives executor contexts a fetcher that blocks redirects to loopback targets", async () => {
    const calls = stubFetchSequence([
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1:8080/admin" } }),
    ]);
    const executors = defineProviderExecutors<{ fetcher: typeof fetch }>({
      service: "test_service",
      handlers: {
        async probe(_input, context) {
          const response = await context.fetcher("https://api.example.com/resource");
          return { status: response.status };
        },
      },
      createContext: (_context, fetcher) => ({ fetcher }),
    });

    const result = await executors["test_service.probe"]!({}, executionContext);

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("redirect location");
    expect(calls).toHaveLength(1);
  });

  it("keeps caller manual-redirect handling intact through providerFetch", async () => {
    const calls = stubFetchSequence([new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } })]);

    const response = await providerFetch("https://api.example.com/report", { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(calls).toHaveLength(1);
  });
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
    const receiverContext: ExecutionContext = {
      async getCredential() {
        return undefined;
      },
    };

    await expect(executors["receiver_test.request"]!({}, receiverContext)).resolves.toEqual({
      ok: true,
      output: { ok: true },
    });
    expect(nativeFetchThis).toBeUndefined();
  });
});
