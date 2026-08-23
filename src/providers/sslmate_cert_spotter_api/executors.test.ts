import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { executors, proxy } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "sslmate-api-key",
  values: {},
  profile: { accountId: "api_key", displayName: "SSLMate API Key", grantedScopes: [] },
  metadata: {},
};

const context: ExecutionContext = {
  getCredential: async () => credential,
};

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
  vi.unstubAllGlobals();
});

describe("Cert Spotter resolver DNS", () => {
  it("rejects an allowlisted API host that resolves to cloud metadata before any fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "169.254.169.254", family: 4 }]);

    const result = await executors["sslmate_cert_spotter_api.list_certificate_issuances"]!(
      { domain: "example.com" },
      context,
    );

    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("must not resolve to private or reserved IP addresses") },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a proxy target host that resolves to cloud metadata before any fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "169.254.169.254", family: 4 }]);

    const result = await proxy({ method: "GET", endpoint: "/ct-search/issuances" }, context);

    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("must not resolve to private or reserved IP addresses") },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
