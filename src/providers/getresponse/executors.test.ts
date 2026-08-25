import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { executors } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "getresponse-key",
  values: { maxApiBaseUrl: "https://api3.getresponse360.com/v3", domain: "example.com" },
  profile: { accountId: "getresponse", displayName: "GetResponse", grantedScopes: [] },
  metadata: { apiBaseUrl: "https://api3.getresponse360.com/v3", domain: "example.com" },
};

const context: ExecutionContext = {
  getCredential: async () => credential,
};

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
  vi.unstubAllGlobals();
});

describe("GetResponse MAX API base URL DNS", () => {
  it("rejects an allowlisted MAX host that resolves to cloud metadata before any fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    setDefaultGuardedFetchDnsLookup(async () => [{ address: "169.254.169.254", family: 4 }]);

    const result = await executors["getresponse.list_campaigns"]!({}, context);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "provider_error", message: "GetResponse request failed" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
