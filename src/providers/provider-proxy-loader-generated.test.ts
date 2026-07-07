import type { ExecutionContext, ResolvedCredential } from "../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderLoader } from "./provider-loader.ts";
import { executorModules } from "./registry.generated.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProviderLoader proxy executors (generated)", () => {
  it("loads manual proxy executors with scoped endpoint coverage", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const proxy = await new ProviderLoader().loadProxyExecutor("alchemy");

    expect(proxy).toEqual(expect.any(Function));

    const credential: ResolvedCredential = {
      authType: "api_key",
      apiKey: "alchemy-key",
      values: { apiKey: "alchemy-key" },
      profile: { accountId: "acct_1", displayName: "Alchemy", grantedScopes: [] },
      metadata: {},
    };
    const context: ExecutionContext = {
      getCredential: async () => credential,
    };

    await proxy?.(
      {
        endpoint: "/v2/demo",
        method: "GET",
      },
      context,
    );
    const rejected = await proxy?.(
      {
        endpoint: "/admin",
        method: "GET",
      },
      context,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(new URL("https://eth-mainnet.g.alchemy.com/v2/demo"), expect.any(Object));
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(Object.fromEntries((init.headers as Headers).entries())).toMatchObject({
      authorization: "Bearer alchemy-key",
      "user-agent": "oomol-connect/0.1",
    });
    expect(rejected).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        message: "endpoint is not supported for this provider",
      },
    });
  });

  it("loads a proxy executor for every provider", async () => {
    const loader = new ProviderLoader();
    const missing: string[] = [];
    for (const service of Object.keys(executorModules).sort()) {
      if (!(await loader.loadProxyExecutor(service))) {
        missing.push(service);
      }
    }

    expect(missing).toEqual([]);
  });

  it("loads generated provider proxy executors when the provider module has no explicit proxy", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
        new Response(JSON.stringify({ data: [] }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const loader = new ProviderLoader();
    const proxy = await loader.loadProxyExecutor("gamma");

    expect(proxy).toEqual(expect.any(Function));

    const credential: ResolvedCredential = {
      authType: "api_key",
      apiKey: "gamma-key",
      values: { apiKey: "gamma-key" },
      profile: { accountId: "acct_1", displayName: "Gamma", grantedScopes: [] },
      metadata: {},
    };
    const context: ExecutionContext = {
      getCredential: async () => credential,
    };
    await proxy?.(
      {
        endpoint: "/v1.0/themes",
        method: "GET",
      },
      context,
    );

    expect(fetcher).toHaveBeenCalledWith(new URL("https://public-api.gamma.app/v1.0/themes"), expect.any(Object));
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(Object.fromEntries((init.headers as Headers).entries())).toMatchObject({
      "user-agent": "oomol-connect/0.1",
      "x-api-key": "gamma-key",
    });
  });
});
