import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";

const credential: ResolvedCredential = {
  authType: "api_key",
  apiKey: "test-key",
  values: { instanceUrl: "https://n8n.tailnet.ts.net" },
  profile: { accountId: "n8n:test", displayName: "n8n test", grantedScopes: [] },
  metadata: {},
};

const executionContext: ExecutionContext = {
  getCredential: async () => credential,
};

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(undefined);
  setPrivateNetworkAccessAllowed(false);
  vi.unstubAllGlobals();
});

describe("n8n private-network access", () => {
  it("rejects a Tailscale-resolving instance by default", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "100.64.0.12", family: 4 }]);

    const result = await executors["n8n.list_workflows"]!({}, executionContext);

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("must not resolve to private or reserved IP addresses");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows credential validation, executor requests, and proxy requests when opted in", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "100.64.0.12", family: 4 }]);
    setPrivateNetworkAccessAllowed(true);

    await expect(
      credentialValidators.apiKey!(
        { apiKey: credential.apiKey, values: credential.values },
        { fetcher: globalThis.fetch, signal: undefined },
      ),
    ).resolves.toMatchObject({ metadata: { apiBaseUrl: "https://n8n.tailnet.ts.net/api/v1" } });
    await expect(executors["n8n.list_workflows"]!({}, executionContext)).resolves.toMatchObject({ ok: true });
    await expect(proxy({ method: "GET", endpoint: "/workflows" }, executionContext)).resolves.toMatchObject({
      ok: true,
    });

    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://n8n.tailnet.ts.net/api/v1/discover",
      "https://n8n.tailnet.ts.net/api/v1/workflows",
      "https://n8n.tailnet.ts.net/api/v1/workflows",
    ]);
  });

  it("keeps loopback targets blocked even when opted in", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "127.0.0.1", family: 4 }]);
    setPrivateNetworkAccessAllowed(true);

    const result = await executors["n8n.list_workflows"]!({}, executionContext);

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("must not resolve to private or reserved IP addresses");
    expect(fetch).not.toHaveBeenCalled();
  });
});
