import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { withProviderNetworkPolicy } from "../../core/provider-network-policy.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";

function executionContext(baseUrl: string): ExecutionContext {
  return {
    getCredential: async () => ({
      authType: "api_key",
      apiKey: "postiz-test-key",
      values: { baseUrl },
      profile: { accountId: "postiz:test", displayName: "Postiz test", grantedScopes: [] },
      metadata: {},
    }),
  };
}

async function runEntryPoints(baseUrl: string): Promise<boolean[]> {
  const context = executionContext(baseUrl);
  const validation = await credentialValidators.apiKey!(
    { apiKey: "postiz-test-key", values: { baseUrl } },
    { fetcher: globalThis.fetch },
  ).then(
    () => true,
    () => false,
  );
  const action = await executors["postiz.list_integrations"]!({}, context);
  const proxied = await proxy({ method: "GET", endpoint: "/integrations" }, context);
  return [validation, action.ok, proxied.ok];
}

function stubFetch() {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    return Response.json(url.pathname.endsWith("/is-connected") ? { connected: true } : []);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  // Keep real DNS disabled, as configured in vitest.setup.ts.
  setDefaultGuardedFetchDnsLookup(null);
  vi.unstubAllGlobals();
});

describe("postiz base URL", () => {
  it.each([
    ["", "https://api.postiz.com/public/v1"],
    ["https://postiz.example.com", "https://postiz.example.com/api/public/v1"],
    ["https://postiz.example.com/api/", "https://postiz.example.com/api/public/v1"],
    ["https://postiz.example.com/api/public/v1/", "https://postiz.example.com/api/public/v1"],
    ["https://postiz.example.com/postiz/api/?key=value#fragment", "https://postiz.example.com/postiz/api/public/v1"],
    ["https://api.postiz.com/public/v1", "https://api.postiz.com/public/v1"],
  ])("resolves %j across validation, actions, and proxy", async (baseUrl, expected) => {
    const fetcher = stubFetch();
    expect(await runEntryPoints(baseUrl)).toEqual([true, true, true]);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      `${expected}/is-connected`,
      `${expected}/integrations`,
      `${expected}/integrations`,
    ]);
  });

  it.each(["http://192.168.31.10:5005", "http://postiz.example.com"])(
    "requires private-network opt-in for %s",
    async (baseUrl) => {
      const fetcher = stubFetch();
      setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
      expect(await runEntryPoints(baseUrl)).toEqual([false, false, false]);
      expect(fetcher).not.toHaveBeenCalled();

      await withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
        expect(await runEntryPoints(baseUrl)).toEqual([true, true, true]);
      });
    },
  );

  it("requires private-network opt-in for a hostname resolving to a LAN address", async () => {
    const fetcher = stubFetch();
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "192.168.31.10", family: 4 }]);
    const baseUrl = "https://postiz.example.com";
    expect(await runEntryPoints(baseUrl)).toEqual([false, false, false]);
    expect(fetcher).not.toHaveBeenCalled();

    await withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
      expect(await runEntryPoints(baseUrl)).toEqual([true, true, true]);
    });
  });

  it.each(["http://127.0.0.1:5005", "http://169.254.169.254", "https://user:password@postiz.example.com"])(
    "rejects %s even with private-network opt-in",
    async (baseUrl) => {
      const fetcher = stubFetch();
      await withProviderNetworkPolicy({ allowPrivateNetwork: true }, async () => {
        expect(await runEntryPoints(baseUrl)).toEqual([false, false, false]);
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
